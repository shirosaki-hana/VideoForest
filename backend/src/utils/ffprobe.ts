import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import path from 'path';
import { logger } from './log.js';
//------------------------------------------------------------------------------//

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export interface FFprobeInfo {
  path: string;
  version: string;
  source: 'system' | 'installer';
}

let cachedFFprobeInfo: FFprobeInfo | null = null;

/**
 * FFprobe 정보 캐시 무효화
 * 테스트용으로만 사용
 */
export function clearFFprobeCache(): void {
  cachedFFprobeInfo = null;
}

/**
 * 최적의 FFprobe 경로 감지
 *
 * 우선순위:
 * 1. 시스템 FFprobe
 * 2. @ffprobe-installer/ffprobe (번들)
 */
export async function detectFFprobe(): Promise<FFprobeInfo> {
  // 캐시된 정보 반환
  if (cachedFFprobeInfo) {
    return cachedFFprobeInfo;
  }

  logger.info('Detecting FFprobe installation...');

  // 1. 시스템 FFprobe 확인
  const systemFFprobe = await checkSystemFFprobe();
  if (systemFFprobe) {
    logger.success(`Using system FFprobe: ${systemFFprobe.path}`);
    logger.info(`  Version: ${systemFFprobe.version}`);
    cachedFFprobeInfo = systemFFprobe;
    return systemFFprobe;
  }

  // 2. Installer FFprobe 사용
  logger.info(`Using bundled FFprobe: ${ffprobeInstaller.path}`);

  const installerInfo: FFprobeInfo = {
    path: ffprobeInstaller.path,
    version: (await getFFprobeVersion(ffprobeInstaller.path)) || 'unknown',
    source: 'installer',
  };

  cachedFFprobeInfo = installerInfo;
  return installerInfo;
}

/**
 * 시스템 FFprobe 확인
 */
async function checkSystemFFprobe(): Promise<FFprobeInfo | null> {
  try {
    // which/where 명령으로 FFprobe 경로 찾기
    const isWindows = process.platform === 'win32';
    const whichCmd = isWindows ? 'where ffprobe' : 'which ffprobe';

    let ffprobePath: string;
    try {
      const { stdout } = await execAsync(whichCmd);
      ffprobePath = stdout.trim().split('\n')[0]; // 첫 번째 경로 사용
    } catch {
      // 시스템 FFprobe 없음
      return null;
    }

    if (!ffprobePath) {
      return null;
    }

    // FFprobe 버전 확인
    const version = await getFFprobeVersion(ffprobePath);
    if (!version) {
      return null;
    }

    return {
      path: ffprobePath,
      version,
      source: 'system',
    };
  } catch (error) {
    logger.debug?.(`Failed to check system FFprobe: ${error}`);
    return null;
  }
}

/**
 * FFprobe 버전 확인
 */
async function getFFprobeVersion(ffprobePath: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execAsync(`"${ffprobePath}" -version`);
    const output = stdout || stderr;
    const match = output.match(/ffprobe version ([^\s]+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * 동기 버전: FFprobe 경로 가져오기
 *
 * 주의: 첫 호출 시 detectFFprobe()를 먼저 호출해야 함
 */
export function getFFprobePath(): string {
  if (cachedFFprobeInfo) {
    return cachedFFprobeInfo.path;
  }

  // 캐시되지 않은 경우 installer 경로 반환 (폴백)
  logger.warn('FFprobe not detected yet, using installer fallback');
  return ffprobeInstaller.path;
}

// 파일 경로 검증 함수
function isValidFilePath(filePath: string): boolean {
  // execFile을 사용하므로 shell을 거치지 않아 대부분의 특수문자는 안전합니다.
  // 실제로 위험한 패턴만 검사합니다.
  const dangerousPatterns = [
    /\0/, // NULL 바이트 (모든 시스템에서 금지)
    /^\.\.[\\/]/, // 시작이 ../ 또는 ..\ (상위 디렉터리 탐색)
    /[\\/]\.\.[\\/]/, // 경로 중간에 /../ 또는 \..\  (상위 디렉터리 탐색)
    /[\\/]\.\.$/, // 경로 끝이 /.. 또는 \.. (상위 디렉터리 탐색)
  ];

  return !dangerousPatterns.some(pattern => pattern.test(filePath));
}

export interface MediaMetadata {
  duration: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  bitrate: number | null;
  fps: number | null;
  audioCodec: string | null;
}

/**
 * 저수준 FFprobe 실행 래퍼 (spawn 기반)
 * 
 * @param args FFprobe 인자 배열
 * @param options spawn 옵션
 * @returns stdout 내용
 */
export function executeFFprobe(
  args: string[],
  options?: {
    timeout?: number;
    maxBuffer?: number;
  }
): Promise<{ stdout: string; stderr: string }> {
  const ffprobePath = getFFprobePath();

  return new Promise((resolve, reject) => {
    const ffprobe = spawn(ffprobePath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timeoutHandle: NodeJS.Timeout | null = null;

    // 타임아웃 설정
    if (options?.timeout) {
      timeoutHandle = setTimeout(() => {
        ffprobe.kill('SIGKILL');
        reject(new Error(`FFprobe timeout after ${options.timeout}ms`));
      }, options.timeout);
    }

    ffprobe.stdout?.on('data', (data) => {
      stdout += data.toString();
      // 버퍼 크기 제한
      if (options?.maxBuffer && stdout.length > options.maxBuffer) {
        ffprobe.kill('SIGKILL');
        reject(new Error('FFprobe output exceeded maxBuffer'));
      }
    });

    ffprobe.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('error', (error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(error);
    });

    ffprobe.on('exit', (code, signal) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `FFprobe exited with code ${code} (signal: ${signal})\nStderr: ${stderr}`
          )
        );
      }
    });
  });
}

/**
 * ffprobe를 사용하여 미디어 파일의 메타데이터를 추출합니다.
 * @param filePath 미디어 파일의 절대 경로
 * @returns 미디어 메타데이터 객체
 */
export async function extractMediaMetadata(filePath: string): Promise<MediaMetadata> {
  // 보안: 파일 경로 검증
  if (!isValidFilePath(filePath)) {
    throw new Error('Invalid file path: contains dangerous characters');
  }

  // 절대 경로로 정규화
  const normalizedPath = path.resolve(filePath);

  try {
    // ffprobe 실행
    const { stdout } = await executeFFprobe(
      [
        '-v',
        'error', // 에러만 출력
        '-show_entries',
        'format=duration,bit_rate:stream=codec_name,codec_type,width,height,r_frame_rate',
        '-of',
        'json', // JSON 형식 출력
        normalizedPath,
      ],
      {
        timeout: 30000, // 30초 타임아웃
        maxBuffer: 1024 * 1024, // 1MB 버퍼
      }
    );

    const probeData = JSON.parse(stdout);

    interface FFprobeStream {
      codec_type?: string;
      codec_name?: string;
      width?: number | string;
      height?: number | string;
      r_frame_rate?: string;
    }

    interface FFprobeFormat {
      duration?: number | string;
      bit_rate?: number | string;
    }

    // 비디오 스트림 찾기
    const videoStream = (probeData.streams as FFprobeStream[] | undefined)?.find(s => s.codec_type === 'video');

    // 오디오 스트림 찾기
    const audioStream = (probeData.streams as FFprobeStream[] | undefined)?.find(s => s.codec_type === 'audio');

    // fps 계산
    let fps: number | null = null;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
      if (den && den !== 0) {
        fps = num / den;
      }
    }

    const format = probeData.format as FFprobeFormat | undefined;

    return {
      duration: format?.duration ? parseFloat(String(format.duration)) : null,
      width: videoStream?.width ? parseInt(String(videoStream.width)) : null,
      height: videoStream?.height ? parseInt(String(videoStream.height)) : null,
      codec: videoStream?.codec_name || null,
      bitrate: format?.bit_rate ? parseInt(String(format.bit_rate)) : null,
      fps: fps,
      audioCodec: audioStream?.codec_name || null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to extract metadata from ${filePath}:`, errorMessage);

    // 메타데이터 추출 실패 시 null 반환
    return {
      duration: null,
      width: null,
      height: null,
      codec: null,
      bitrate: null,
      fps: null,
      audioCodec: null,
    };
  }
}

/**
 * 세그먼트 검증용 FFprobe 실행
 * 
 * 세그먼트 파일의 정확한 duration, 스트림 정보, 키프레임 정보를 추출합니다.
 * 
 * @param segmentPath 세그먼트 파일 경로
 * @returns 세그먼트 정보
 */
export async function probeSegment(segmentPath: string): Promise<{
  duration: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  startsWithKeyframe: boolean;
}> {
  try {
    // 파일 경로 검증
    if (!isValidFilePath(segmentPath)) {
      throw new Error('Invalid segment path');
    }

    const normalizedPath = path.resolve(segmentPath);

    // 세그먼트 정보 추출 (첫 패킷 포함)
    const { stdout } = await executeFFprobe(
      [
        '-v', 'error',
        '-show_entries', 'stream=codec_type:format=duration:packet=flags,pts_time',
        '-select_streams', 'v:0',
        '-read_intervals', '%+#1', // 첫 패킷만
        '-of', 'json',
        normalizedPath,
      ],
      {
        timeout: 10000, // 10초 타임아웃
        maxBuffer: 512 * 1024, // 512KB 버퍼
      }
    );

    const result = JSON.parse(stdout);

    // Duration 추출
    const duration = result.format?.duration ? parseFloat(result.format.duration) : null;

    // 스트림 확인
    const streams = result.streams || [];
    const hasVideo = streams.some((s: any) => s.codec_type === 'video');
    const hasAudio = streams.some((s: any) => s.codec_type === 'audio');

    // 첫 패킷이 keyframe인지 확인
    const packets = result.packets || [];
    const firstPacket = packets[0];
    const startsWithKeyframe = firstPacket?.flags?.includes('K') || false;

    return {
      duration,
      hasVideo,
      hasAudio,
      startsWithKeyframe,
    };
  } catch (error) {
    logger.warn(`Failed to probe segment ${segmentPath}: ${error}`);
    
    // 검증 실패 시 기본값 반환 (계속 진행)
    return {
      duration: null,
      hasVideo: true,
      hasAudio: true,
      startsWithKeyframe: true,
    };
  }
}
