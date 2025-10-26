import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { logger, getFFmpegPath } from '../../utils/index.js';
import { buildVideoEncoderArgs, buildAudioEncoderArgs, buildVideoFilter, getErrorResilienceArgs } from './transcoder/encoder.options.js';
import { getSegmentStartTime, getSegmentPath, getQualityDir } from './segment.utils.js';
import type { QualityProfile, MediaAnalysis, SegmentInfo } from './types.js';
//------------------------------------------------------------------------------//

/**
 * 단일 세그먼트 JIT 트랜스코딩
 * 
 * 핵심 아이디어:
 * - FFmpeg의 -ss 옵션으로 정확한 시작 위치로 seek
 * - -t 옵션으로 정확한 길이만큼만 인코딩
 * - 완성된 세그먼트 파일을 디스크에 저장 (영구 캐싱)
 * 
 * @param mediaPath 원본 미디어 파일 경로
 * @param segmentInfo 세그먼트 정보
 * @param profile 화질 프로파일
 * @param analysis 미디어 분석 결과
 * @param outputPath 출력 파일 경로
 * @returns 성공 여부
 */
export async function transcodeSegment(
  mediaPath: string,
  segmentInfo: SegmentInfo,
  profile: QualityProfile,
  analysis: MediaAnalysis,
  outputPath: string
): Promise<boolean> {
  // 출력 디렉터리 생성
  const outputDir = path.dirname(outputPath);
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  logger.info(
    `JIT transcoding: segment ${segmentInfo.segmentNumber} ` +
    `(${segmentInfo.startTime}s ~ ${segmentInfo.startTime + segmentInfo.duration}s) ` +
    `to ${profile.name}`
  );

  // FFmpeg 명령어 구성
  const ffmpegArgs = buildSegmentFFmpegArgs(
    mediaPath,
    segmentInfo,
    profile,
    analysis,
    outputPath
  );

  const ffmpegPath = getFFmpegPath();

  // 디버그: 커맨드 로깅
  logger.debug?.(`FFmpeg command: ${ffmpegPath} ${ffmpegArgs.join(' ')}`);

  // FFmpeg 프로세스 실행 (동기적으로 완료 대기)
  return new Promise<boolean>((resolve, reject) => {
    const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let stdout = '';

    ffmpegProcess.stderr?.on('data', (data) => {
      const message = data.toString();
      stderr += message;

      // 진행 상황 로깅
      if (message.includes('time=') && message.includes('speed=')) {
        logger.debug?.(message.trim());
      }
    });

    ffmpegProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    ffmpegProcess.on('error', (error) => {
      logger.error(`FFmpeg process error: ${error.message}`);
      reject(error);
    });

    ffmpegProcess.on('exit', (code, signal) => {
      if (code === 0) {
        // 성공
        logger.success(
          `Segment ${segmentInfo.segmentNumber} transcoded successfully ` +
          `(${profile.name})`
        );
        resolve(true);
      } else {
        // 실패
        logger.error(
          `Segment ${segmentInfo.segmentNumber} transcoding failed ` +
          `(exit code: ${code}, signal: ${signal})`
        );
        logger.error(`FFmpeg stderr:\n${stderr.slice(-1000)}`); // 마지막 1000자만
        resolve(false);
      }
    });
  });
}

/**
 * 단일 세그먼트용 FFmpeg 인자 생성
 * 
 * 핵심 옵션:
 * - -ss: 시작 위치 (입력 파일 전에 위치하여 빠른 seek)
 * - -t: 인코딩 길이
 * - -f mpegts: MPEG-TS 출력 (HLS 세그먼트 포맷)
 */
function buildSegmentFFmpegArgs(
  mediaPath: string,
  segmentInfo: SegmentInfo,
  profile: QualityProfile,
  analysis: MediaAnalysis,
  outputPath: string
): string[] {
  const args: string[] = [];

  // 1. 에러 복원 옵션 (손상된 파일 대응)
  args.push(...getErrorResilienceArgs());

  // 2. SEEK 옵션 (입력 파일 전에 위치 - 빠른 키프레임 seek)
  // 정확한 seek을 위해 약간 앞에서 시작 후 -t로 정확히 자름
  args.push('-ss', segmentInfo.startTime.toString());

  // 3. 입력 파일
  args.push('-i', normalizePathForFFmpeg(mediaPath));

  // 4. 인코딩 길이 제한
  args.push('-t', segmentInfo.duration.toString());

  // 5. 오디오가 없는 경우 무음 생성
  if (!analysis.hasAudio) {
    args.push('-f', 'lavfi');
    args.push('-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  }

  // 6. 스트림 매핑
  if (!analysis.hasAudio) {
    args.push('-map', '0:v:0'); // 비디오
    args.push('-map', '1:a:0'); // 무음 오디오
  } else {
    args.push('-map', '0:v:0');
    args.push('-map', '0:a:0');
  }

  // 7. 비디오 인코딩 옵션
  const videoFilter = buildVideoFilter(profile, analysis);
  if (videoFilter !== 'null') {
    args.push('-vf', videoFilter);
  }
  args.push(...buildVideoEncoderArgs(profile, analysis));

  // 8. 오디오 인코딩 옵션
  args.push(...buildAudioEncoderArgs(profile, analysis));

  // 9. 오디오가 없고 무음을 생성한 경우
  if (!analysis.hasAudio) {
    args.push('-shortest'); // 비디오 길이에 맞춤
  }

  // 10. MPEG-TS 출력 (HLS 세그먼트 포맷)
  args.push('-f', 'mpegts');

  // 11. 출력 파일
  args.push(normalizePathForFFmpeg(outputPath));

  return args;
}

/**
 * Windows 경로를 FFmpeg가 이해할 수 있는 형식으로 정규화
 */
function normalizePathForFFmpeg(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * 세그먼트 캐시 확인
 * 
 * @param mediaId 미디어 ID
 * @param quality 화질
 * @param segmentNumber 세그먼트 번호
 * @param baseDir 기본 디렉터리
 * @returns 캐시된 파일 경로 (없으면 null)
 */
export function checkSegmentCache(
  mediaId: string,
  quality: string,
  segmentNumber: number,
  baseDir: string = 'temp/hls'
): string | null {
  const segmentPath = getSegmentPath(mediaId, quality, segmentNumber, baseDir);
  
  if (existsSync(segmentPath)) {
    logger.debug?.(`Cache hit: ${segmentPath}`);
    return segmentPath;
  }
  
  logger.debug?.(`Cache miss: ${segmentPath}`);
  return null;
}

/**
 * 세그먼트 캐시 확인 (존재 여부만)
 */
export function isSegmentCached(
  mediaId: string,
  quality: string,
  segmentNumber: number,
  baseDir: string = 'temp/hls'
): boolean {
  return checkSegmentCache(mediaId, quality, segmentNumber, baseDir) !== null;
}

