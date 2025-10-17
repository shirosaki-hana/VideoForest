import fs from 'fs/promises';
import path from 'path';
import { database } from '../database/index.js';
import { env } from '../config/index.js';
import { extractMediaMetadata } from '../utils/index.js';
import { logger, backendRoot } from '../utils/index.js';
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

interface DirectoryStructure {
  path: string;
  name: string;
  folders: DirectoryStructure[];
  files: string[];
}

/**
 * 디렉터리를 재귀적으로 탐색하여 구조를 반환합니다.
 */
async function scanDirectoryStructure(dirPath: string): Promise<DirectoryStructure> {
  const folders: DirectoryStructure[] = [];
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // 디렉터리면 재귀적으로 탐색
        const subStructure = await scanDirectoryStructure(fullPath);
        folders.push(subStructure);
      } else if (entry.isFile() && isMediaFile(entry.name)) {
        // 미디어 파일이면 추가
        files.push(fullPath);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to scan directory ${dirPath}:`, errorMessage);
  }

  return {
    path: dirPath,
    name: path.basename(dirPath),
    folders,
    files,
  };
}

/**
 * 디렉터리 구조를 DB에 저장합니다.
 * @returns 생성된 폴더의 ID
 */
async function saveFolderStructure(structure: DirectoryStructure, parentId: string | null = null): Promise<string> {
  // 폴더가 이미 존재하는지 확인
  let folder = await database.mediaFolder.findUnique({
    where: { path: structure.path },
  });

  // 없으면 생성
  if (!folder) {
    folder = await database.mediaFolder.create({
      data: {
        name: structure.name,
        path: structure.path,
        parentId,
      },
    });
    logger.info(`Created folder: ${structure.name} (${structure.path})`);
  } else if (folder.parentId !== parentId) {
    // parentId가 변경되었으면 업데이트
    folder = await database.mediaFolder.update({
      where: { id: folder.id },
      data: { parentId },
    });
  }

  // 하위 폴더들 재귀적으로 저장
  for (const subFolder of structure.folders) {
    await saveFolderStructure(subFolder, folder.id);
  }

  return folder.id;
}

export interface ScanProgressCallback {
  (current: number, total: number, fileName: string): void;
}

/**
 * 환경 변수에 설정된 모든 미디어 디렉터리를 스캔하고 DB를 갱신합니다.
 * 진행 상황을 콜백으로 전달합니다.
 */
export async function refreshMediaLibraryWithProgress(
  onProgress?: ScanProgressCallback
): Promise<{ total: number; success: number; failed: number }> {
  logger.info('Starting media library refresh...');

  // 환경 변수에서 미디어 경로 가져오기
  const mediaPaths = env.MEDIA_PATHS.map(p => {
    // 상대 경로면 backend 디렉터리 기준으로 절대 경로로 변환
    return path.isAbsolute(p) ? p : path.resolve(backendRoot, p);
  });

  logger.info(`Scanning directories: ${mediaPaths.join(', ')}`);

  // 모든 디렉터리 구조 스캔
  const structures: DirectoryStructure[] = [];
  for (const dirPath of mediaPaths) {
    try {
      await fs.access(dirPath);
      const structure = await scanDirectoryStructure(dirPath);
      structures.push(structure);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Directory not accessible: ${dirPath} - ${errorMessage}`);
    }
  }

  // 디렉터리 구조를 DB에 저장
  logger.info('Saving directory structure to database...');
  for (const structure of structures) {
    await saveFolderStructure(structure, null);
  }

  // 모든 미디어 파일 수집
  const allMediaFiles: { path: string; folderId: string }[] = [];

  async function collectMediaFiles(structure: DirectoryStructure) {
    const folder = await database.mediaFolder.findUnique({
      where: { path: structure.path },
    });

    if (folder) {
      for (const filePath of structure.files) {
        allMediaFiles.push({ path: filePath, folderId: folder.id });
      }

      for (const subFolder of structure.folders) {
        await collectMediaFiles(subFolder);
      }
    }
  }

  for (const structure of structures) {
    await collectMediaFiles(structure);
  }

  logger.info(`Found ${allMediaFiles.length} media files`);

  // DB의 기존 미디어 목록 가져오기
  const existingMedia = await database.media.findMany();
  const existingPaths = new Set(existingMedia.map(m => m.filePath));

  // 새로운 파일만 처리
  const mediaToProcess = allMediaFiles.filter(({ path }) => !existingPaths.has(path));

  logger.info(`Processing ${mediaToProcess.length} new media files...`);

  // 각 파일의 메타데이터 추출 및 DB 저장
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < mediaToProcess.length; i++) {
    const { path: filePath, folderId } = mediaToProcess[i];
    const filename = path.basename(filePath);

    try {
      // 진행 상황 콜백 호출
      if (onProgress) {
        onProgress(i + 1, mediaToProcess.length, filename);
      }

      const fileSize = await getFileSize(filePath);
      const metadata = await extractMediaMetadata(filePath);

      await database.media.create({
        data: {
          name: filename,
          filePath: filePath,
          folderId: folderId,
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
      failedCount++;
      logger.error(`Failed to process ${filePath}:`, errorMessage);
    }
  }

  // 존재하지 않는 파일 DB에서 삭제
  const allMediaPathsSet = new Set(allMediaFiles.map(({ path }) => path));
  const filesToDelete = existingMedia.filter(m => !allMediaPathsSet.has(m.filePath));

  if (filesToDelete.length > 0) {
    logger.info(`Removing ${filesToDelete.length} deleted files from database...`);
    for (const media of filesToDelete) {
      await database.media.delete({ where: { id: media.id } });
      logger.info(`Removed: ${media.name}`);
    }
  }

  // 존재하지 않는 폴더 DB에서 삭제
  const allFolders = await database.mediaFolder.findMany();
  const validFolderPaths = new Set<string>();

  function collectFolderPaths(structure: DirectoryStructure) {
    validFolderPaths.add(structure.path);
    for (const subFolder of structure.folders) {
      collectFolderPaths(subFolder);
    }
  }

  for (const structure of structures) {
    collectFolderPaths(structure);
  }

  const foldersToDelete = allFolders.filter(f => !validFolderPaths.has(f.path));

  if (foldersToDelete.length > 0) {
    logger.info(`Removing ${foldersToDelete.length} deleted folders from database...`);
    for (const folder of foldersToDelete) {
      await database.mediaFolder.delete({ where: { id: folder.id } });
      logger.info(`Removed folder: ${folder.name}`);
    }
  }

  logger.success(`Media library refresh completed! Total: ${allMediaFiles.length} files`);

  return {
    total: allMediaFiles.length,
    success: successCount,
    failed: failedCount,
  };
}
