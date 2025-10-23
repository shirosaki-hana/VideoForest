import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { logger } from '../../utils/index.js';

/**
 * HLS 출력 디렉터리 경로 생성
 */
export function getOutputDir(mediaId: string): string {
  return path.join(process.cwd(), 'temp', 'hls', mediaId);
}

/**
 * 출력 디렉터리 생성
 */
export async function createOutputDir(outputDir: string): Promise<boolean> {
  try {
    await fs.mkdir(outputDir, { recursive: true });
    return true;
  } catch (error) {
    logger.error(`Failed to create output directory: ${error}`);
    return false;
  }
}

/**
 * 출력 디렉터리 삭제
 */
export async function cleanupOutputDir(outputDir: string): Promise<void> {
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
  } catch {
    // 무시 - 정리 실패는 치명적이지 않음
  }
}

/**
 * 첫 번째 세그먼트가 생성될 때까지 대기
 *
 * 단순화: segment_000.ts와 playlist.m3u8만 체크
 */
export async function waitForFirstSegment(outputDir: string): Promise<boolean> {
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
      } catch {
        // 파일이 아직 쓰이는 중
      }
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return false;
}

/**
 * 세그먼트 파일 경로 생성
 */
export function getSegmentFilePath(outputDir: string, segmentName: string): string {
  return path.join(outputDir, segmentName);
}
