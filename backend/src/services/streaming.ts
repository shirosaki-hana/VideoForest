import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { logger } from '../utils/index.js';
import { database } from '../database/index.js';
//------------------------------------------------------------------------------//

// ffmpeg 실행 파일 경로
const ffmpegPath = ffmpegInstaller.path;

// HLS 세션 관리
interface HLSSession {
  mediaId: string;
  process: ChildProcess;
  outputDir: string;
  lastAccess: number;
  playlist: string;
}

// 활성 세션 맵
const activeSessions = new Map<string, HLSSession>();

// 세션 타임아웃 (30분)
const SESSION_TIMEOUT = 30 * 60 * 1000;

/**
 * 세션 정리 작업 (주기적으로 실행)
 */
async function cleanupSessions() {
  const now = Date.now();
  const sessionsToCleanup: string[] = [];

  for (const [mediaId, session] of activeSessions.entries()) {
    if (now - session.lastAccess > SESSION_TIMEOUT) {
      sessionsToCleanup.push(mediaId);
    }
  }

  for (const mediaId of sessionsToCleanup) {
    await stopStreaming(mediaId);
  }
}

// 10분마다 세션 정리
setInterval(cleanupSessions, 10 * 60 * 1000);

/**
 * 미디어 ID로 파일 경로를 가져옵니다.
 */
async function getMediaPath(mediaId: string): Promise<string | null> {
  const media = await database.media.findUnique({
    where: { id: mediaId },
  });

  return media?.filePath || null;
}

/**
 * HLS 출력 디렉터리 경로를 생성합니다.
 */
function getOutputDir(mediaId: string): string {
  // 임시 디렉터리에 HLS 파일 저장
  return path.join(process.cwd(), 'temp', 'hls', mediaId);
}

/**
 * HLS 스트리밍을 시작합니다.
 */
export async function startStreaming(mediaId: string): Promise<string | null> {
  // 이미 세션이 있으면 재사용
  const existingSession = activeSessions.get(mediaId);
  if (existingSession) {
    existingSession.lastAccess = Date.now();
    return existingSession.playlist;
  }

  // 미디어 파일 경로 가져오기
  const mediaPath = await getMediaPath(mediaId);
  if (!mediaPath || !existsSync(mediaPath)) {
    logger.error(`Media file not found: ${mediaId}`);
    return null;
  }

  // 출력 디렉터리 생성
  const outputDir = getOutputDir(mediaId);
  await fs.mkdir(outputDir, { recursive: true });

  const playlistPath = path.join(outputDir, 'playlist.m3u8');

  logger.info(`Starting HLS streaming for ${mediaId}`);
  logger.info(`Input: ${mediaPath}`);
  logger.info(`Output: ${outputDir}`);

  // FFmpeg 프로세스 시작
  // HLS 트랜스코딩 옵션:
  // - 여러 해상도의 adaptive streaming 지원
  // - H.264 비디오 코덱, AAC 오디오 코덱
  // - 6초 세그먼트
  const ffmpegProcess = spawn(ffmpegPath, [
    '-i',
    mediaPath,
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-sc_threshold',
    '0',
    '-g',
    '48',
    '-keyint_min',
    '48',
    // HLS 옵션
    '-hls_time',
    '6',
    '-hls_list_size',
    '0',
    '-hls_segment_type',
    'mpegts',
    '-hls_segment_filename',
    path.join(outputDir, 'segment_%03d.ts'),
    '-f',
    'hls',
    playlistPath,
  ]);

  // 에러 로깅
  ffmpegProcess.stderr?.on('data', data => {
    const message = data.toString();
    if (message.includes('error') || message.includes('Error')) {
      logger.error(`FFmpeg error for ${mediaId}: ${message}`);
    }
  });

  ffmpegProcess.on('error', error => {
    logger.error(`Failed to start FFmpeg for ${mediaId}:`, error);
    activeSessions.delete(mediaId);
  });

  ffmpegProcess.on('exit', code => {
    if (code !== 0 && code !== null) {
      logger.warn(`FFmpeg process exited with code ${code} for ${mediaId}`);
    }
  });

  // 세션 저장
  const session: HLSSession = {
    mediaId,
    process: ffmpegProcess,
    outputDir,
    lastAccess: Date.now(),
    playlist: playlistPath,
  };

  activeSessions.set(mediaId, session);

  // 플레이리스트 파일이 생성될 때까지 대기 (최대 10초)
  for (let i = 0; i < 100; i++) {
    if (existsSync(playlistPath)) {
      logger.success(`HLS streaming started for ${mediaId}`);
      return playlistPath;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  logger.error(`Playlist file not created for ${mediaId}`);
  await stopStreaming(mediaId);
  return null;
}

/**
 * HLS 스트리밍을 중지합니다.
 */
export async function stopStreaming(mediaId: string): Promise<void> {
  const session = activeSessions.get(mediaId);
  if (!session) {
    return;
  }

  logger.info(`Stopping HLS streaming for ${mediaId}`);

  // FFmpeg 프로세스 종료
  try {
    session.process.kill('SIGTERM');
  } catch (error) {
    logger.error(`Failed to kill FFmpeg process for ${mediaId}:`, error);
  }

  // 출력 디렉터리 삭제
  try {
    await fs.rm(session.outputDir, { recursive: true, force: true });
  } catch (error) {
    logger.error(`Failed to remove output directory for ${mediaId}:`, error);
  }

  activeSessions.delete(mediaId);
  logger.success(`HLS streaming stopped for ${mediaId}`);
}

/**
 * HLS 플레이리스트 파일 경로를 가져옵니다.
 */
export async function getPlaylistPath(mediaId: string): Promise<string | null> {
  const session = activeSessions.get(mediaId);
  if (session) {
    session.lastAccess = Date.now();
    return session.playlist;
  }

  // 세션이 없으면 시작
  return await startStreaming(mediaId);
}

/**
 * HLS 세그먼트 파일 경로를 가져옵니다.
 */
export function getSegmentPath(mediaId: string, segmentName: string): string | null {
  const session = activeSessions.get(mediaId);
  if (!session) {
    return null;
  }

  session.lastAccess = Date.now();
  return path.join(session.outputDir, segmentName);
}

/**
 * 모든 활성 스트리밍 세션을 종료합니다.
 */
export async function stopAllStreaming(): Promise<void> {
  logger.info('Stopping all HLS streaming sessions...');
  const mediaIds = Array.from(activeSessions.keys());

  await Promise.all(mediaIds.map(mediaId => stopStreaming(mediaId)));

  logger.success('All HLS streaming sessions stopped');
}
