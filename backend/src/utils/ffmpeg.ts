import { exec } from 'child_process';
import { promisify } from 'util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { logger } from './log.js';

const execAsync = promisify(exec);

export interface FFmpegInfo {
  path: string;
  version: string;
  source: 'system' | 'installer';
}

let cachedFFmpegInfo: FFmpegInfo | null = null;

/**
 * FFmpeg 정보 캐시 무효화
 * 테스트용으로만 사용
 */
export function clearFFmpegCache(): void {
  cachedFFmpegInfo = null;
}

/**
 * 최적의 FFmpeg 경로 감지
 *
 * 우선순위:
 * 1. 시스템 FFmpeg
 * 2. @ffmpeg-installer/ffmpeg (번들)
 *
 * CPU 트랜스코딩만 지원합니다.
 */
export async function detectFFmpeg(): Promise<FFmpegInfo> {
  // 캐시된 정보 반환
  if (cachedFFmpegInfo) {
    return cachedFFmpegInfo;
  }

  logger.info('Detecting FFmpeg installation...');

  // 1. 시스템 FFmpeg 확인
  const systemFFmpeg = await checkSystemFFmpeg();
  if (systemFFmpeg) {
    logger.success(`Using system FFmpeg: ${systemFFmpeg.path}`);
    logger.info(`  Version: ${systemFFmpeg.version}`);
    cachedFFmpegInfo = systemFFmpeg;
    return systemFFmpeg;
  }

  // 2. Installer FFmpeg 사용
  logger.info(`Using bundled FFmpeg: ${ffmpegInstaller.path}`);

  const installerInfo: FFmpegInfo = {
    path: ffmpegInstaller.path,
    version: (await getFFmpegVersion(ffmpegInstaller.path)) || 'unknown',
    source: 'installer',
  };

  cachedFFmpegInfo = installerInfo;
  return installerInfo;
}

/**
 * 시스템 FFmpeg 확인
 */
async function checkSystemFFmpeg(): Promise<FFmpegInfo | null> {
  try {
    // which/where 명령으로 FFmpeg 경로 찾기
    const isWindows = process.platform === 'win32';
    const whichCmd = isWindows ? 'where ffmpeg' : 'which ffmpeg';

    let ffmpegPath: string;
    try {
      const { stdout } = await execAsync(whichCmd);
      ffmpegPath = stdout.trim().split('\n')[0]; // 첫 번째 경로 사용
    } catch {
      // 시스템 FFmpeg 없음
      return null;
    }

    if (!ffmpegPath) {
      return null;
    }

    // FFmpeg 버전 확인
    const version = await getFFmpegVersion(ffmpegPath);
    if (!version) {
      return null;
    }

    return {
      path: ffmpegPath,
      version,
      source: 'system',
    };
  } catch (error) {
    logger.debug?.(`Failed to check system FFmpeg: ${error}`);
    return null;
  }
}

/**
 * FFmpeg 버전 확인
 */
async function getFFmpegVersion(ffmpegPath: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execAsync(`"${ffmpegPath}" -version`);
    const output = stdout || stderr;
    const match = output.match(/ffmpeg version ([^\s]+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * 사용 가능한 트랜스코딩 방식 확인
 * CPU만 지원합니다.
 */
export async function getAvailableTranscodeMethods(): Promise<string[]> {
  await detectFFmpeg();
  return ['cpu']; // CPU만 사용 가능
}

/**
 * 동기 버전: FFmpeg 경로 가져오기
 *
 * 주의: 첫 호출 시 detectFFmpeg()를 먼저 호출해야 함
 */
export function getFFmpegPath(): string {
  if (cachedFFmpegInfo) {
    return cachedFFmpegInfo.path;
  }

  // 캐시되지 않은 경우 installer 경로 반환 (폴백)
  logger.warn('FFmpeg not detected yet, using installer fallback');
  return ffmpegInstaller.path;
}
