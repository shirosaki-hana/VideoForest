import fs from 'fs/promises';
import path from 'path';
import { database } from '../database/index.js';
import { env } from '../config/index.js';
import { extractMediaMetadata } from '../utils/index.js';
import { logger, backendRoot } from '../utils/index.js';
import type { MediaTreeNode } from '@videoforest/types';
//------------------------------------------------------------------------------//

// 지원하는 미디어 파일 확장자
const SUPPORTED_EXTENSIONS = [
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.wmv',
  '.flv',
  '.webm',
  '.m4v',
  '.mpg',
  '.mpeg',
  '.3gp',
  '.ogv',
  '.ts',
  '.m2ts',
];

/**
 * 파일이 미디어 파일인지 확인합니다.
 */
function isMediaFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * 디렉터리를 재귀적으로 탐색하여 모든 미디어 파일 경로를 반환합니다.
 */
async function scanDirectory(dirPath: string): Promise<string[]> {
  const mediaFiles: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // 디렉터리면 재귀적으로 탐색
        const subFiles = await scanDirectory(fullPath);
        mediaFiles.push(...subFiles);
      } else if (entry.isFile() && isMediaFile(entry.name)) {
        // 미디어 파일이면 추가
        mediaFiles.push(fullPath);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to scan directory ${dirPath}:`, errorMessage);
  }

  return mediaFiles;
}

/**
 * 파일 크기를 바이트 단위로 반환합니다.
 */
async function getFileSize(filePath: string): Promise<number | null> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return null;
  }
}

/**
 * 환경 변수에 설정된 모든 미디어 디렉터리를 스캔하고 DB를 갱신합니다.
 */
export async function refreshMediaLibrary() {
  logger.info('Starting media library refresh...');

  // 환경 변수에서 미디어 경로 가져오기
  const mediaPaths = env.MEDIA_PATHS.map(p => {
    // 상대 경로면 backend 디렉터리 기준으로 절대 경로로 변환
    return path.isAbsolute(p) ? p : path.resolve(backendRoot, p);
  });

  logger.info(`Scanning directories: ${mediaPaths.join(', ')}`);

  // 모든 디렉터리 스캔
  const allMediaFiles: string[] = [];
  for (const dirPath of mediaPaths) {
    try {
      await fs.access(dirPath);
      const files = await scanDirectory(dirPath);
      allMediaFiles.push(...files);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Directory not accessible: ${dirPath} - ${errorMessage}`);
    }
  }

  logger.info(`Found ${allMediaFiles.length} media files`);

  // DB의 기존 미디어 목록 가져오기
  const existingMedia = await database.media.findMany();
  const existingPaths = new Set(existingMedia.map(m => m.filePath));

  // 새로운 파일과 업데이트가 필요한 파일 처리
  const mediaToProcess = allMediaFiles.filter(filePath => {
    return !existingPaths.has(filePath);
  });

  logger.info(`Processing ${mediaToProcess.length} new media files...`);

  // 각 파일의 메타데이터 추출 및 DB 저장
  let successCount = 0;
  for (const filePath of mediaToProcess) {
    try {
      const filename = path.basename(filePath);
      const fileSize = await getFileSize(filePath);
      const metadata = await extractMediaMetadata(filePath);

      await database.media.create({
        data: {
          name: filename,
          filePath: filePath,
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          codec: metadata.codec,
          bitrate: metadata.bitrate,
          fps: metadata.fps,
          audioCodec: metadata.audioCodec,
          fileSize: fileSize,
        },
      });

      successCount++;
      logger.info(`[${successCount}/${mediaToProcess.length}] Added: ${filename}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to process ${filePath}:`, errorMessage);
    }
  }

  // 존재하지 않는 파일 DB에서 삭제
  const allMediaPathsSet = new Set(allMediaFiles);
  const filesToDelete = existingMedia.filter(m => !allMediaPathsSet.has(m.filePath));

  if (filesToDelete.length > 0) {
    logger.info(`Removing ${filesToDelete.length} deleted files from database...`);
    for (const media of filesToDelete) {
      await database.media.delete({ where: { id: media.id } });
      logger.info(`Removed: ${media.name}`);
    }
  }

  logger.success(`Media library refresh completed! Total: ${allMediaFiles.length} files`);

  // 전체 미디어 목록 반환
  return await database.media.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * DB에 저장된 미디어 목록을 반환합니다.
 */
export async function getMediaList() {
  return await database.media.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * 폴더의 하위 트리를 재귀적으로 구성합니다.
 */
async function buildFolderTree(folderId: string | null): Promise<MediaTreeNode[]> {
  // 해당 폴더의 직속 하위 폴더들 조회
  const folders = await database.mediaFolder.findMany({
    where: { parentId: folderId },
    orderBy: { name: 'asc' },
  });

  // 해당 폴더의 미디어 파일들 조회
  const mediaFiles = await database.media.findMany({
    where: { folderId: folderId },
    orderBy: { name: 'asc' },
  });

  const result: MediaTreeNode[] = [];

  // 폴더 노드 추가
  for (const folder of folders) {
    const children = await buildFolderTree(folder.id);
    result.push({
      id: folder.id,
      name: folder.name,
      type: 'folder',
      path: folder.path,
      folderId: folder.parentId,
      children: children.length > 0 ? children : undefined,
    });
  }

  // 파일 노드 추가
  for (const media of mediaFiles) {
    result.push({
      id: media.id,
      name: media.name,
      type: 'file',
      path: media.filePath,
      folderId: media.folderId,
      duration: media.duration,
      width: media.width,
      height: media.height,
      codec: media.codec,
      bitrate: media.bitrate !== null ? Number(media.bitrate) : null,
      fps: media.fps,
      audioCodec: media.audioCodec,
      fileSize: media.fileSize !== null ? Number(media.fileSize) : null,
    });
  }

  return result;
}

/**
 * 미디어 라이브러리를 트리 구조로 반환합니다.
 */
export async function getMediaTree(): Promise<MediaTreeNode[]> {
  // 최상위 폴더들(parentId가 null인 폴더들)부터 시작
  return await buildFolderTree(null);
}

/**
 * 특정 폴더의 내용을 반환합니다.
 */
export async function getFolderContents(folderId: string | null): Promise<MediaTreeNode[]> {
  return await buildFolderTree(folderId);
}
