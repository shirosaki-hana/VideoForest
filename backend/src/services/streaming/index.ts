import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { database } from '../../database/index.js';
import { env } from '../../config/index.js';
import { logger } from '../../utils/index.js';
import { sessionManager } from './session.manager.js';
import { startABRTranscoding } from './transcoder/index.js';
import { selectQualityProfiles } from './transcoder/ffmpeg.config.js';
import { generateMasterPlaylist } from './playlist/index.js';
import type { HLSSession, MediaInfo } from './types.js';
//------------------------------------------------------------------------------//

/**
 * HLS 출력 디렉터리 경로 생성
 */
function getOutputDir(mediaId: string): string {
  return path.join(process.cwd(), 'temp', 'hls', mediaId);
}

/**
 * 미디어 정보 조회
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
    },
  };
}

/**
 * HLS 스트리밍 시작
 * 
 * 1. 기존 세션이 있으면 재사용
 * 2. 미디어 정보 조회 및 검증
 * 3. 원본 해상도 기반 품질 프로파일 선택
 * 4. FFmpeg ABR 트랜스코딩 시작
 * 5. Master Playlist 생성
 * 6. 세션 등록
 */
export async function startStreaming(mediaId: string): Promise<string | null> {
  // 기존 세션 재사용
  const existingSession = sessionManager.getSession(mediaId);
  if (existingSession) {
    logger.info(`Reusing existing session for media ${mediaId}`);
    return existingSession.masterPlaylist;
  }

  // 미디어 정보 조회
  const mediaData = await getMediaInfo(mediaId);
  if (!mediaData) {
    logger.error(`Media not found: ${mediaId}`);
    return null;
  }

  if (!existsSync(mediaData.path)) {
    logger.error(`Media file not found: ${mediaData.path}`);
    return null;
  }

  // 출력 디렉터리 생성
  const outputDir = getOutputDir(mediaId);
  await fs.mkdir(outputDir, { recursive: true });

  // 품질 프로파일 선택 (원본 해상도 기반)
  const profiles = selectQualityProfiles(mediaData.info.width, mediaData.info.height);
  logger.info(`Selected quality profiles for ${mediaId}: ${profiles.map(p => p.name).join(', ')}`);

  // 트랜스코딩 방식 (GPU 폴백 지원)
  let transcodeMethod = env.TRANSCODE_METHOD;
  logger.info(`Starting HLS streaming for ${mediaId}`);
  logger.info(`Transcode method: ${transcodeMethod.toUpperCase()}`);
  logger.info(`Input: ${mediaData.path}`);
  logger.info(`Output: ${outputDir}`);

  // FFmpeg ABR 트랜스코딩 시작
  let result = await startABRTranscoding(mediaData.path, outputDir, profiles, transcodeMethod);

  // GPU 실패 시 CPU로 폴백
  if (!result && transcodeMethod !== 'cpu') {
    logger.warn(`Falling back to CPU encoding for ${mediaId}`);
    
    // 손상된 파일 정리
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
      await fs.mkdir(outputDir, { recursive: true });
    } catch (error) {
      logger.error(`Failed to clean output directory: ${error}`);
    }

    transcodeMethod = 'cpu';
    result = await startABRTranscoding(mediaData.path, outputDir, profiles, transcodeMethod);
  }

  if (!result) {
    logger.error(`Failed to start transcoding for ${mediaId}`);
    return null;
  }

  // Master Playlist 생성
  const masterPlaylistContent = generateMasterPlaylist(profiles);
  const masterPlaylistPath = result.masterPlaylistPath;
  
  // Master Playlist 파일 쓰기
  await fs.writeFile(masterPlaylistPath, masterPlaylistContent);

  // 세션 등록
  const session: HLSSession = {
    mediaId,
    process: result.process,
    outputDir,
    lastAccess: Date.now(),
    masterPlaylist: masterPlaylistPath,
    qualityProfiles: result.qualityProfiles,
  };

  sessionManager.addSession(session);

  // 첫 세그먼트 생성 대기 (최대 15초)
  const firstSegmentReady = await waitForFirstSegment(outputDir, profiles[0].name);
  if (!firstSegmentReady) {
    logger.error(`Failed to generate first segment for ${mediaId}`);
    await sessionManager.removeSession(mediaId);
    return null;
  }

  // 모든 변이(variant) 플레이리스트 준비 대기 (최대 2초)
  const allVariantsReady = await waitForVariantPlaylists(outputDir, session.qualityProfiles.length, 2000);
  if (!allVariantsReady) {
    // 생성이 지연되는 경우가 있어도 스트리밍은 시작되었으므로 경고만 남기고 진행
    logger.warn(`Some variant playlists are not ready yet for ${mediaId}, continuing...`);
  }

  logger.success(`HLS streaming started for ${mediaId}`);
  return masterPlaylistPath;
}

/**
 * 첫 번째 세그먼트가 생성될 때까지 대기
 */
async function waitForFirstSegment(outputDir: string, firstProfileName: string): Promise<boolean> {
  const firstSegmentDir = path.join(outputDir, 'v0');
  const firstSegmentPath = path.join(firstSegmentDir, 'segment_000.ts');
  const playlistPath = path.join(firstSegmentDir, 'playlist.m3u8');

  for (let i = 0; i < 150; i++) {
    const segmentExists = existsSync(firstSegmentPath);
    const playlistExists = existsSync(playlistPath);

    if (segmentExists && playlistExists) {
      try {
        const stats = await fs.stat(firstSegmentPath);
        if (stats.size > 0) {
          return true;
        }
      } catch (error) {
        // 파일이 아직 쓰이는 중
      }
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return false;
}

/**
 * 모든 변이(variant) 플레이리스트가 생성될 때까지 짧게 대기
 * - 변이 수가 많은 경우 초기 요청에서 404가 발생하는 것을 줄이기 위함
 */
async function waitForVariantPlaylists(outputDir: string, variantCount: number, timeoutMs = 2000): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const allReady = Array.from({ length: variantCount }).every((_, index) => {
      const playlistPath = path.join(outputDir, `v${index}`, 'playlist.m3u8');
      return existsSync(playlistPath);
    });

    if (allReady) {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
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
 * Master Playlist 경로 조회 (자동 시작)
 */
export async function getMasterPlaylistPath(mediaId: string): Promise<string | null> {
  const session = sessionManager.getSession(mediaId);
  if (session) {
    return session.masterPlaylist;
  }

  // 세션이 없으면 시작
  return await startStreaming(mediaId);
}

/**
 * 특정 품질의 Playlist 경로 조회
 */
export function getQualityPlaylistPath(mediaId: string, qualityIndex: number): string | null {
  const session = sessionManager.getSession(mediaId);
  if (!session) {
    return null;
  }

  return path.join(session.outputDir, `v${qualityIndex}`, 'playlist.m3u8');
}

/**
 * 세그먼트 파일 경로 조회
 */
export function getSegmentPath(mediaId: string, qualityIndex: number, segmentName: string): string | null {
  const session = sessionManager.getSession(mediaId);
  if (!session) {
    return null;
  }

  return path.join(session.outputDir, `v${qualityIndex}`, segmentName);
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

