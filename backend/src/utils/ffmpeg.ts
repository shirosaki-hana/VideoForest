import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { logger } from './log.js';

const execAsync = promisify(exec);

export interface FFmpegInfo {
  path: string;
  version: string;
  supportsNVENC: boolean;
  supportsQSV: boolean;
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
 * 최적의 FFmpeg 경로 및 지원 기능 감지
 *
 * 우선순위:
 * 1. 시스템 FFmpeg (NVENC/QSV 지원 있으면)
 * 2. @ffmpeg-installer/ffmpeg (CPU 전용)
 */
export async function detectFFmpeg(): Promise<FFmpegInfo> {
  // 캐시된 정보 반환
  if (cachedFFmpegInfo) {
    return cachedFFmpegInfo;
  }

  logger.info('Detecting FFmpeg installation and capabilities...');

  // 1. 시스템 FFmpeg 확인
  const systemFFmpeg = await checkSystemFFmpeg();
  if (systemFFmpeg && (systemFFmpeg.supportsNVENC || systemFFmpeg.supportsQSV)) {
    logger.success(`Using system FFmpeg: ${systemFFmpeg.path}`);
    logger.info(`  Version: ${systemFFmpeg.version}`);
    logger.info(`  NVENC support: ${systemFFmpeg.supportsNVENC ? '✓' : '✗'}`);
    logger.info(`  QSV support: ${systemFFmpeg.supportsQSV ? '✓' : '✗'}`);
    cachedFFmpegInfo = systemFFmpeg;
    return systemFFmpeg;
  }

  // 2. Installer FFmpeg 사용 (CPU 전용)
  logger.warn('System FFmpeg not found or lacks GPU encoder support');
  logger.info(`Using bundled FFmpeg (CPU only): ${ffmpegInstaller.path}`);
  
  const installerInfo: FFmpegInfo = {
    path: ffmpegInstaller.path,
    version: await getFFmpegVersion(ffmpegInstaller.path) || 'unknown',
    supportsNVENC: false,
    supportsQSV: false,
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

    // 인코더 지원 확인
    const supportsNVENC = await checkEncoderSupport(ffmpegPath, 'h264_nvenc');
    const supportsQSV = await checkEncoderSupport(ffmpegPath, 'h264_qsv');

    return {
      path: ffmpegPath,
      version,
      supportsNVENC,
      supportsQSV,
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
 * 특정 인코더 지원 확인
 */
async function checkEncoderSupport(ffmpegPath: string, encoder: string): Promise<boolean> {
  try {
    const { stdout, stderr } = await execAsync(`"${ffmpegPath}" -encoders 2>&1`);
    const output = stdout || stderr;
    
    // 인코더 목록에서 찾기 (예: "V..... h264_nvenc")
    const regex = new RegExp(`\\s+${encoder}\\s+`, 'i');
    return regex.test(output);
  } catch {
    return false;
  }
}

/**
 * 사용 가능한 트랜스코딩 방식 확인
 */
export async function getAvailableTranscodeMethods(): Promise<string[]> {
  const ffmpeg = await detectFFmpeg();
  const methods: string[] = ['cpu']; // CPU는 항상 사용 가능

  if (ffmpeg.supportsNVENC) {
    methods.push('nvenc');
  }

  if (ffmpeg.supportsQSV) {
    methods.push('qsv');
  }

  return methods;
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

/**
 * 동기 버전: NVENC 지원 여부
 */
export function supportsNVENC(): boolean {
  return cachedFFmpegInfo?.supportsNVENC ?? false;
}

/**
 * 동기 버전: QSV 지원 여부
 */
export function supportsQSV(): boolean {
  return cachedFFmpegInfo?.supportsQSV ?? false;
}

