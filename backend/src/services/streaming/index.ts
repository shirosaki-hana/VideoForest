import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { database } from '../../database/index.js';
import { env } from '../../config/index.js';
import { logger } from '../../utils/index.js';
import { sessionManager } from './session.manager.js';
import { startTranscoding, selectOptimalProfile, calculateOptimalSegmentTime } from './transcoder/index.js';
import type { HLSSession, MediaInfo, MediaAnalysis, TranscodeMethod } from './types.js';
//------------------------------------------------------------------------------//

/**
 * HLS 출력 디렉터리 경로 생성
 */
function getOutputDir(mediaId: string): string {
  return path.join(process.cwd(), 'temp', 'hls', mediaId);
}

/**
 * 미디어 정보 조회 (DB에서)
 */
async function getMediaInfo(mediaId: string): Promise<{ path: string; info: MediaInfo } | null> {
  const media = await database.media.findUnique({
    where: { id: mediaId },
  });

  if (!media || !media.filePath) {
    return null;
  }

  return {
    path: media.filePath,
    info: {
      width: media.width,
      height: media.height,
      duration: media.duration,
      codec: media.codec,
      audioCodec: media.audioCodec,
      fps: media.fps,
      bitrate: media.bitrate !== null ? Number(media.bitrate) : null,
    },
  };
}

/**
 * 미디어 분석 - 호환성 체크 및 트랜스코딩 전략 결정
 *
 * 핵심 로직: 메타데이터를 기반으로 최적의 트랜스코딩 전략을 결정합니다.
 */
function analyzeMedia(mediaInfo: MediaInfo, transcodeMethod: TranscodeMethod): MediaAnalysis {
  const issues: string[] = [];

  // 1. 비디오 코덱 분석
  const videoCodec = mediaInfo.codec?.toLowerCase() || 'unknown';
  const needsVideoTranscode = !['h264', 'avc'].includes(videoCodec);

  if (!mediaInfo.codec) {
    issues.push('Unknown video codec');
  } else if (needsVideoTranscode) {
    issues.push(`Incompatible video codec: ${mediaInfo.codec} (will transcode to H.264)`);
  }

  // 2. 오디오 분석
  const audioCodec = mediaInfo.audioCodec?.toLowerCase();
  const hasAudio = !!audioCodec;
  const needsAudioTranscode = hasAudio && !['aac', 'mp3'].includes(audioCodec);

  if (!hasAudio) {
    issues.push('No audio stream (will generate silent audio)');
  } else if (needsAudioTranscode) {
    issues.push(`Incompatible audio codec: ${mediaInfo.audioCodec} (will transcode to AAC)`);
  }

  // 3. 해상도 분석
  if (!mediaInfo.width || !mediaInfo.height) {
    issues.push('Unknown resolution (will use default 720p)');
  }

  // 4. FPS 분석
  const fps = mediaInfo.fps || 24;
  if (!mediaInfo.fps) {
    issues.push('Unknown frame rate (will use default 24fps)');
  }

  // 5. 최적 세그먼트 시간 계산 (FPS와 인코더 제약 기반)
  const segmentTime = calculateOptimalSegmentTime(fps, transcodeMethod);
  if (segmentTime < 6) {
    issues.push(`High frame rate detected (${fps}fps), using ${segmentTime}s segments to maintain GOP constraints`);
  }

  // 6. 직접 복사 가능 여부 (향후 최적화를 위해)
  const canDirectCopy =
    videoCodec === 'h264' && (!hasAudio || audioCodec === 'aac') && mediaInfo.width !== null && mediaInfo.height !== null;

  // 7. 품질 프로파일 선택
  const recommendedProfile = selectOptimalProfile(mediaInfo);

  // 8. 입력 포맷 정보
  const inputFormat = {
    videoCodec: mediaInfo.codec || 'unknown',
    audioCodec: mediaInfo.audioCodec || null,
    width: mediaInfo.width || 1280,
    height: mediaInfo.height || 720,
    fps,
  };

  const analysis: MediaAnalysis = {
    canDirectCopy,
    needsVideoTranscode,
    needsAudioTranscode,
    hasAudio,
    compatibilityIssues: issues,
    recommendedProfile,
    segmentTime, // 계산된 최적 세그먼트 시간
    inputFormat,
  };

  // 분석 결과 로깅
  if (issues.length > 0) {
    logger.warn('Media compatibility issues:');
    issues.forEach(issue => logger.warn(`  - ${issue}`));
  } else {
    logger.info('Media is fully compatible');
  }

  logger.info(`Optimal segment time: ${segmentTime}s (GOP size: ${Math.round(fps * segmentTime)} frames)`);

  return analysis;
}

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
    if (existing) return existing.playlistPath;
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
    if (reuse) return reuse;

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

    // 5. 미디어 분석 (트랜스코딩 방식 고려)
    const transcodeMethod: TranscodeMethod = env.TRANSCODE_METHOD;
    logger.info(`Analyzing media ${mediaId}...`);
    const analysis = analyzeMedia(mediaData.info, transcodeMethod);
    logger.info(`Selected profile: ${analysis.recommendedProfile.name}`);

    // 6. 출력 디렉터리 생성
    const outputDir = getOutputDir(mediaId);
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (error) {
      sessionManager.recordFailure({
        mediaId,
        error: `Failed to create output directory: ${error}`,
      });
      logger.error(`Failed to create output directory: ${error}`);
      return null;
    }

    // 7. 트랜스코딩 시작 (설정된 방식으로, 폴백 없음)
    logger.info(`Starting HLS streaming for ${mediaId}`);
    logger.info(`Transcode method: ${transcodeMethod.toUpperCase()}`);
    logger.info(`Input: ${mediaData.path}`);
    logger.info(`Output: ${outputDir}`);

    const result = await startTranscoding(mediaData.path, outputDir, analysis.recommendedProfile, transcodeMethod, analysis);

    // 트랜스코딩 시작 실패
    if (!result) {
      const errorMessage =
        transcodeMethod === 'cpu'
          ? 'Failed to start CPU transcoding'
          : `Failed to start ${transcodeMethod.toUpperCase()} GPU transcoding. Please check GPU drivers and availability.`;

      sessionManager.recordFailure({
        mediaId,
        error: errorMessage,
        analysis,
      });
      logger.error(`Failed to start transcoding for ${mediaId}: ${errorMessage}`);

      // 출력 디렉터리 정리
      try {
        await fs.rm(outputDir, { recursive: true, force: true });
      } catch (error) {
        // 무시
      }

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
 * 첫 번째 세그먼트가 생성될 때까지 대기
 *
 * 단순화: segment_000.ts와 playlist.m3u8만 체크
 */
async function waitForFirstSegment(outputDir: string): Promise<boolean> {
  const firstSegmentPath = path.join(outputDir, 'segment_000.ts');
  const playlistPath = path.join(outputDir, 'playlist.m3u8');

  // 최대 20초 대기 (200ms * 100)
  for (let i = 0; i < 100; i++) {
    const segmentExists = existsSync(firstSegmentPath);
    const playlistExists = existsSync(playlistPath);

    if (segmentExists && playlistExists) {
      try {
        const stats = await fs.stat(firstSegmentPath);
        if (stats.size > 0) {
          logger.info('First segment ready');
          return true;
        }
      } catch (error) {
        // 파일이 아직 쓰이는 중
      }
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return false;
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

  return path.join(session.outputDir, segmentName);
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
