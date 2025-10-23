import { existsSync } from 'fs';
import { logger } from '../../utils/index.js';
import { sessionManager } from './session.manager.js';
import { startTranscoding } from './transcoder/index.js';
import { getMediaInfo, analyzeMedia } from './media.analyzer.js';
import { getOutputDir, createOutputDir, cleanupOutputDir, waitForFirstSegment, getSegmentFilePath } from './file.utils.js';
import type { HLSSession } from './types.js';
//------------------------------------------------------------------------------//

/**
 * HLS 스트리밍 시작
 *
 * 단순화된 단일 품질 트랜스코딩
 *
 * 플로우:
 * 1. 기존 세션 재사용 체크
 * 2. 세션 삭제 중이면 완료 대기 (레이스 컨디션 방지)
 * 3. 최근 실패 여부 체크 (404 무한 루프 방지)
 * 4. 미디어 정보 조회 및 검증
 * 5. 미디어 분석 (호환성 체크)
 * 6. 트랜스코딩 시작 (설정된 방식으로만, 폴백 없음)
 * 7. 세션 등록
 * 8. 첫 세그먼트 대기
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
      return existing.playlistPath;
    }
    // 시작 실패한 경우만 아래 로직 진행
  }

  // 1. 기존 세션 재사용
  const existingSession = sessionManager.getSession(mediaId);
  if (existingSession) {
    logger.info(`Reusing existing session for media ${mediaId}`);
    return existingSession.playlistPath;
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

    // 5. 미디어 분석 (CPU 트랜스코딩만 지원)
    logger.info(`Analyzing media ${mediaId}...`);
    const analysis = analyzeMedia(mediaData.info);
    logger.info(`Selected profile: ${analysis.recommendedProfile.name}`);

    // 6. 출력 디렉터리 생성
    const outputDir = getOutputDir(mediaId);
    const dirCreated = await createOutputDir(outputDir);
    if (!dirCreated) {
      sessionManager.recordFailure({
        mediaId,
        error: 'Failed to create output directory',
      });
      return null;
    }

    // 7. 트랜스코딩 시작 (CPU만 지원)
    logger.info(`Starting HLS streaming for ${mediaId}`);
    logger.info(`Transcode method: CPU`);
    logger.info(`Input: ${mediaData.path}`);
    logger.info(`Output: ${outputDir}`);

    const result = await startTranscoding(mediaData.path, outputDir, analysis.recommendedProfile, analysis);

    // 트랜스코딩 시작 실패
    if (!result) {
      const errorMessage = 'Failed to start CPU transcoding';

      sessionManager.recordFailure({
        mediaId,
        error: errorMessage,
        analysis,
      });
      logger.error(`Failed to start transcoding for ${mediaId}: ${errorMessage}`);

      // 출력 디렉터리 정리
      await cleanupOutputDir(outputDir);

      return null;
    }

    // 8. 세션 등록
    const session: HLSSession = {
      mediaId,
      process: result.process,
      outputDir,
      lastAccess: Date.now(),
      playlistPath: result.playlistPath,
      profile: result.profile,
      analysis,
    };

    sessionManager.addSession(session);

    // 9. 첫 세그먼트 생성 대기
    // 프로세스가 이미 완료되었으면 파일이 준비된 것임
    const processCompleted = result.process.exitCode === 0;

    if (!processCompleted) {
      // 프로세스가 아직 실행 중이면 대기 (최대 20초)
      const firstSegmentReady = await waitForFirstSegment(outputDir);
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
      // 이미 완료된 경우 바로 확인
      logger.info('Transcoding already completed, verifying files...');
      const playlistExists = existsSync(result.playlistPath);
      if (!playlistExists) {
        sessionManager.recordFailure({
          mediaId,
          error: 'Playlist file not found after transcoding completion',
          analysis,
        });
        logger.error(`Playlist not found for ${mediaId}`);
        await sessionManager.removeSession(mediaId);
        return null;
      }
    }

    logger.success(`HLS streaming started successfully for ${mediaId}`);
    return session;
  })();

  // starting 등록 (동시 시작 방지)
  sessionManager.setStarting(mediaId, startPromise);

  try {
    const session = await startPromise;
    return session ? session.playlistPath : null;
  } finally {
    sessionManager.clearStarting(mediaId);
  }
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
 * Playlist 경로 조회 (자동 시작)
 */
export async function getPlaylistPath(mediaId: string): Promise<string | null> {
  const session = sessionManager.getSession(mediaId);
  if (session) {
    return session.playlistPath;
  }

  // 세션이 없으면 시작
  return await startStreaming(mediaId);
}

/**
 * 세그먼트 파일 경로 조회
 */
export function getSegmentPath(mediaId: string, segmentName: string): string | null {
  const session = sessionManager.getSession(mediaId);
  if (!session) {
    return null;
  }

  return getSegmentFilePath(session.outputDir, segmentName);
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
