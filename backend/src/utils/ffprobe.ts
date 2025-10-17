import { execFile } from 'child_process';
import { promisify } from 'util';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import path from 'path';
import { logger } from './log.js';
//------------------------------------------------------------------------------//

const execFileAsync = promisify(execFile);

// ffprobe 실행 파일 경로
const ffprobePath = ffprobeInstaller.path;

// 파일 경로 검증 함수
function isValidFilePath(filePath: string): boolean {
  // execFile을 사용하므로 shell을 거치지 않아 대부분의 특수문자는 안전합니다.
  // 실제로 위험한 패턴만 검사합니다.
  const dangerousPatterns = [
    /\0/, // NULL 바이트 (모든 시스템에서 금지)
    /^\.\.[\\\/]/, // 시작이 ../ 또는 ..\ (상위 디렉터리 탐색)
    /[\\\/]\.\.[\\\/]/, // 경로 중간에 /../ 또는 \..\  (상위 디렉터리 탐색)
    /[\\\/]\.\.$/, // 경로 끝이 /.. 또는 \.. (상위 디렉터리 탐색)
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
    // ffprobe 실행 (execFile을 사용하여 shell injection 방지)
    const { stdout } = await execFileAsync(
      ffprobePath,
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

    // 비디오 스트림 찾기
    const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');

    // 오디오 스트림 찾기
    const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');

    // fps 계산
    let fps: number | null = null;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
      if (den && den !== 0) {
        fps = num / den;
      }
    }

    return {
      duration: probeData.format?.duration ? parseFloat(probeData.format.duration) : null,
      width: videoStream?.width ? parseInt(videoStream.width) : null,
      height: videoStream?.height ? parseInt(videoStream.height) : null,
      codec: videoStream?.codec_name || null,
      bitrate: probeData.format?.bit_rate ? parseInt(probeData.format.bit_rate) : null,
      fps: fps,
      audioCodec: audioStream?.codec_name || null,
    };
  } catch (error: any) {
    logger.error(`Failed to extract metadata from ${filePath}:`, error.message);

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
