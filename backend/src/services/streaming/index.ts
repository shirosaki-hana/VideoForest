import { existsSync, writeFileSync } from 'fs';
import path from 'path';
import { logger } from '../../utils/index.js';
import { sessionManager } from './session.manager.js';
import { startVariantTranscoding } from './transcoder/index.js';
import { getMediaInfo, analyzeMedia } from './media.analyzer.js';
import { getOutputDir, createOutputDir, cleanupOutputDir, waitForFirstSegment, getSegmentFilePath } from './file.utils.js';
import { generateABRProfiles, selectDefaultProfile } from './transcoder/ffmpeg.config.js';
import { generateMasterPlaylist } from './playlist/master.generator.js';
import type { HLSSession, VariantSession } from './types.js';
//------------------------------------------------------------------------------//

/**
 * HLS 스트리밍 시작 (Lazy ABR)
 *
 * ABR 지원 HLS 스트리밍:
 * - 원본 해상도에 따라 여러 품질 프로파일 생성
 * - Master Playlist 생성 (모든 품질 나열)
 * - 초기에는 중간 품질만 트랜스코딩 시작
 * - 다른 품질은 요청 시 on-demand로 시작
 *
 * 플로우:
 * 1. 기존 세션 재사용 체크
 * 2. 세션 삭제 중이면 완료 대기
 * 3. 최근 실패 여부 체크
 * 4. 미디어 정보 조회 및 검증
 * 5. 미디어 분석 (호환성 체크)
 * 6. ABR 프로파일 생성
 * 7. Master Playlist 생성
 * 8. 기본 품질 트랜스코딩 시작
 * 9. 세션 등록
 * 10. 첫 세그먼트 대기
 */
export async function startStreaming(mediaId: string): Promise<string | null> {
  // 최근 중지된 경우 잠시 재시작 차단
  if (sessionManager.isRecentlyStopped(mediaId)) {
    logger.warn(`Start suppressed: media ${mediaId} was stopped very recently`);
    return null;
  }

  // 이미 시작 중인 경우 해당 시작 완료까지 대기 (중복 시작 방지)
  const inProgress = sessionManager.getStarting(mediaId);
  if (inProgress) {
    logger.info(`Start already in progress for ${mediaId}, waiting for completion...`);
    const existing = await inProgress;
    if (existing) {
      return existing.masterPlaylistPath;
    }
    // 시작 실패한 경우만 아래 로직 진행
  }

  // 1. 기존 세션 재사용
  const existingSession = sessionManager.getSession(mediaId);
  if (existingSession) {
    logger.info(`Reusing existing session for media ${mediaId}`);
    return existingSession.masterPlaylistPath;
  }

  // 2. 세션 삭제 중이면 완료 대기
  if (sessionManager.isDeletingSession(mediaId)) {
    logger.info(`Session for ${mediaId} is being deleted, waiting for completion...`);
    const deleted = await sessionManager.waitForSessionDeletion(mediaId, 10000);

    if (!deleted) {
      logger.error(`Timeout waiting for session deletion: ${mediaId}`);
      return null;
    }

    logger.info(`Previous session for ${mediaId} deleted, starting new session`);
  }

  // 3. 최근 실패 체크
  const recentFailure = sessionManager.hasRecentFailure(mediaId);
  if (recentFailure) {
    logger.error(`Media ${mediaId} failed recently (${recentFailure.attemptCount} attempts)`);
    logger.error(`Last error: ${recentFailure.error}`);
    // 실패 기록이 있으면 null 반환 (프론트엔드에서 적절한 에러 표시)
    return null;
  }

  // 4. 미디어 정보 조회 (세션 생성 작업을 단일화하기 위한 starting 프라미스 설정)
  const startPromise = (async (): Promise<HLSSession | null> => {
    // 더블 체크: 기다리는 사이 세션이 생겼을 수 있음
    const reuse = sessionManager.getSession(mediaId);
    if (reuse) {
      return reuse;
    }

    const mediaData = await getMediaInfo(mediaId);
    if (!mediaData) {
      sessionManager.recordFailure({
        mediaId,
        error: 'Media not found in database',
      });
      logger.error(`Media not found: ${mediaId}`);
      return null;
    }

    if (!existsSync(mediaData.path)) {
      sessionManager.recordFailure({
        mediaId,
        error: `Media file not found: ${mediaData.path}`,
      });
      logger.error(`Media file not found: ${mediaData.path}`);
      return null;
    }

    // 5. 미디어 분석
    logger.info(`Analyzing media ${mediaId}...`);
    const analysis = analyzeMedia(mediaData.info);

    // 6. ABR 프로파일 생성
    const availableProfiles = generateABRProfiles(mediaData.info);
    logger.info(`ABR profiles: ${availableProfiles.map(p => p.name).join(', ')}`);

    // 7. 기본(초기) 품질 선택
    const defaultProfile = selectDefaultProfile(availableProfiles);
    logger.info(`Default profile: ${defaultProfile.name}`);

    // 8. 출력 디렉터리 생성
    const outputDir = getOutputDir(mediaId);
    const dirCreated = await createOutputDir(outputDir);
    if (!dirCreated) {
      sessionManager.recordFailure({
        mediaId,
        error: 'Failed to create output directory',
      });
      return null;
    }

    // 9. Master Playlist 생성
    const masterPlaylistPath = path.join(outputDir, 'master.m3u8');
    const masterPlaylistContent = generateMasterPlaylist(availableProfiles);
    try {
      writeFileSync(masterPlaylistPath, masterPlaylistContent);
      logger.success(`Master playlist created: ${masterPlaylistPath}`);
    } catch (error) {
      sessionManager.recordFailure({
        mediaId,
        error: `Failed to write master playlist: ${error}`,
      });
      await cleanupOutputDir(outputDir);
      return null;
    }

    // 10. 세션 생성 (variant는 비어있는 상태)
    const session: HLSSession = {
      mediaId,
      outputDir,
      lastAccess: Date.now(),
      analysis,
      variants: new Map(),
      masterPlaylistPath,
      availableProfiles,
    };

    sessionManager.addSession(session);

    // 11. 기본 품질 variant 트랜스코딩 시작
    logger.info(`Starting default variant transcoding: ${defaultProfile.name}`);
    const variantOutputDir = path.join(outputDir, defaultProfile.name);
    const variantDirCreated = await createOutputDir(variantOutputDir);
    if (!variantDirCreated) {
      sessionManager.recordFailure({
        mediaId,
        error: 'Failed to create variant output directory',
      });
      await sessionManager.removeSession(mediaId);
      return null;
    }

    const result = await startVariantTranscoding(mediaData.path, variantOutputDir, defaultProfile, analysis);

    if (!result) {
      sessionManager.recordFailure({
        mediaId,
        error: 'Failed to start default variant transcoding',
        analysis,
      });
      await sessionManager.removeSession(mediaId);
      return null;
    }

    // 12. Variant 세션 등록
    const variantSession: VariantSession = {
      profile: defaultProfile,
      process: result.process,
      outputDir: variantOutputDir,
      playlistPath: result.playlistPath,
      isReady: false,
      segmentCount: 0,
      lastSegmentTime: Date.now(),
    };

    sessionManager.addVariant(mediaId, defaultProfile.name, variantSession);

    // 13. 첫 세그먼트 생성 대기
    const processCompleted = result.process.exitCode === 0;

    if (!processCompleted) {
      const firstSegmentReady = await waitForFirstSegment(variantOutputDir);
      if (!firstSegmentReady) {
        sessionManager.recordFailure({
          mediaId,
          error: 'First segment generation timeout (20 seconds)',
          analysis,
        });
        logger.error(`Failed to generate first segment for ${mediaId}`);
        await sessionManager.removeSession(mediaId);
        return null;
      }
    } else {
      const playlistExists = existsSync(result.playlistPath);
      if (!playlistExists) {
        sessionManager.recordFailure({
          mediaId,
          error: 'Playlist file not found after transcoding completion',
          analysis,
        });
        await sessionManager.removeSession(mediaId);
        return null;
      }
    }

    // Variant 준비 완료 표시
    variantSession.isReady = true;
    logger.success(`Default variant ${defaultProfile.name} ready`);

    logger.success(`HLS ABR streaming started successfully for ${mediaId}`);
    return session;
  })();

  // starting 등록 (동시 시작 방지)
  sessionManager.setStarting(mediaId, startPromise);

  try {
    const session = await startPromise;
    return session ? session.masterPlaylistPath : null;
  } finally {
    sessionManager.clearStarting(mediaId);
  }
}

/**
 * 특정 품질 variant 요청 (on-demand 시작)
 *
 * Lazy ABR의 핵심:
 * - 요청된 품질이 이미 실행 중이면 바로 반환
 * - 없으면 on-demand로 트랜스코딩 시작
 * - 세션이 없으면 전체 스트리밍 시작
 */
export async function getVariantPlaylistPath(mediaId: string, quality: string): Promise<string | null> {
  // 1. 세션 확인
  let session = sessionManager.getSession(mediaId);

  // 세션이 없으면 전체 스트리밍 시작
  if (!session) {
    logger.info(`Session not found for ${mediaId}, starting full streaming...`);
    const masterPath = await startStreaming(mediaId);
    if (!masterPath) {
      return null;
    }
    session = sessionManager.getSession(mediaId);
    if (!session) {
      logger.error(`Session still not found after starting streaming for ${mediaId}`);
      return null;
    }
  }

  // 2. 요청된 품질이 사용 가능한지 확인
  const profileExists = session.availableProfiles.some(p => p.name === quality);
  if (!profileExists) {
    logger.error(`Quality ${quality} not available for ${mediaId}`);
    return null;
  }

  // 3. 이미 해당 품질이 실행 중이면 반환
  const existingVariant = sessionManager.getVariant(mediaId, quality);
  if (existingVariant) {
    logger.info(`Variant ${quality} already running for ${mediaId}`);
    return existingVariant.playlistPath;
  }

  // 4. On-demand variant 시작
  logger.info(`Starting on-demand variant ${quality} for ${mediaId}`);

  const profile = session.availableProfiles.find(p => p.name === quality);
  if (!profile) {
    logger.error(`Profile ${quality} not found in available profiles`);
    return null;
  }

  // 미디어 경로 조회
  const mediaData = await getMediaInfo(mediaId);
  if (!mediaData || !existsSync(mediaData.path)) {
    logger.error(`Media file not found for on-demand variant: ${mediaId}`);
    return null;
  }

  // Variant 출력 디렉터리 생성
  const variantOutputDir = path.join(session.outputDir, quality);
  const variantDirCreated = await createOutputDir(variantOutputDir);
  if (!variantDirCreated) {
    logger.error(`Failed to create variant output directory for ${quality}`);
    return null;
  }

  // Variant 트랜스코딩 시작
  const result = await startVariantTranscoding(mediaData.path, variantOutputDir, profile, session.analysis);

  if (!result) {
    logger.error(`Failed to start on-demand variant ${quality}`);
    return null;
  }

  // Variant 세션 등록
  const variantSession: VariantSession = {
    profile,
    process: result.process,
    outputDir: variantOutputDir,
    playlistPath: result.playlistPath,
    isReady: false,
    segmentCount: 0,
    lastSegmentTime: Date.now(),
  };

  sessionManager.addVariant(mediaId, quality, variantSession);

  // 첫 세그먼트 대기
  const processCompleted = result.process.exitCode === 0;

  if (!processCompleted) {
    const firstSegmentReady = await waitForFirstSegment(variantOutputDir, 20000);
    if (!firstSegmentReady) {
      logger.error(`First segment timeout for on-demand variant ${quality}`);
      // variant만 제거하면 됨 (세션 전체는 유지)
      return null;
    }
  }

  variantSession.isReady = true;
  logger.success(`On-demand variant ${quality} ready for ${mediaId}`);

  return result.playlistPath;
}

/**
 * HLS 스트리밍 중지
 */
export async function stopStreaming(mediaId: string): Promise<void> {
  await sessionManager.removeSession(mediaId);
}

/**
 * 모든 스트리밍 세션 중지
 */
export async function stopAllStreaming(): Promise<void> {
  await sessionManager.removeAllSessions();
}

/**
 * Master Playlist 경로 조회 (자동 시작)
 */
export async function getPlaylistPath(mediaId: string): Promise<string | null> {
  const session = sessionManager.getSession(mediaId);
  if (session) {
    return session.masterPlaylistPath;
  }

  // 세션이 없으면 시작
  return await startStreaming(mediaId);
}

/**
 * 세그먼트 파일 경로 조회 (품질별)
 *
 * ABR에서는 세그먼트가 품질별 디렉터리에 위치:
 * /tmp/hls/{mediaId}/{quality}/segment_000.ts
 */
export function getSegmentPath(mediaId: string, quality: string, segmentName: string): string | null {
  const variant = sessionManager.getVariant(mediaId, quality);
  if (!variant) {
    return null;
  }

  return getSegmentFilePath(variant.outputDir, segmentName);
}

/**
 * 세션 정보 조회
 */
export function getSessionInfo(mediaId: string) {
  return sessionManager.getSession(mediaId);
}

/**
 * 모든 세션 통계
 */
export function getAllSessionStats() {
  return sessionManager.getStats();
}

/**
 * 실패 기록 조회
 */
export function getFailures() {
  return sessionManager.getAllFailures();
}

/**
 * 실패 기록 초기화 (수동 재시도)
 */
export function clearFailure(mediaId: string) {
  sessionManager.clearFailure(mediaId);
}
