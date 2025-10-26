import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { logger, getFFmpegPath } from '../../utils/index.js';
import { buildVideoEncoderArgs, buildAudioEncoderArgs, buildVideoFilter, getErrorResilienceArgs } from './transcoder/encoder.options.js';
import { getSegmentStartTime, getSegmentPath, getQualityDir } from './segment.utils.js';
import { validateSegment, logValidationResult } from './segment.validator.js';
import type { QualityProfile, MediaAnalysis, SegmentInfo, AccurateSegmentInfo } from './types.js';
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
 * @param segmentInfo 세그먼트 정보 (기본 또는 정확한 세그먼트)
 * @param profile 화질 프로파일
 * @param analysis 미디어 분석 결과
 * @param outputPath 출력 파일 경로
 * @returns 성공 여부
 */
export async function transcodeSegment(
  mediaPath: string,
  segmentInfo: SegmentInfo | AccurateSegmentInfo,
  profile: QualityProfile,
  analysis: MediaAnalysis,
  outputPath: string
): Promise<boolean> {
  // 출력 디렉터리 생성
  const outputDir = path.dirname(outputPath);
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  // 정확한 세그먼트인지 확인
  const isAccurate = 'endTime' in segmentInfo;
  const endTime = isAccurate 
    ? (segmentInfo as AccurateSegmentInfo).endTime 
    : segmentInfo.startTime + segmentInfo.duration;
  const duration = endTime - segmentInfo.startTime;
  
  logger.info(
    `JIT transcoding: segment ${segmentInfo.segmentNumber} ` +
    `(${segmentInfo.startTime.toFixed(3)}s ~ ${endTime.toFixed(3)}s) ` +
    `duration ${duration.toFixed(3)}s ` +
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
  //logger.debug?.(`FFmpeg command: ${ffmpegPath} ${ffmpegArgs.join(' ')}`);

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
      //if (message.includes('time=') && message.includes('speed=')) {
      //  logger.debug?.(message.trim());
      //}
    });

    ffmpegProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    ffmpegProcess.on('error', (error) => {
      logger.error(`FFmpeg process error: ${error.message}`);
      reject(error);
    });

    ffmpegProcess.on('exit', async (code, signal) => {
      if (code === 0) {
        // 성공 - 세그먼트 검증
        logger.success(
          `Segment ${segmentInfo.segmentNumber} transcoded successfully ` +
          `(${profile.name})`
        );
        
        // 세그먼트 품질 검증 (비동기, 에러 무시)
        try {
          const validation = await validateSegment(outputPath);
          logValidationResult(
            segmentInfo.segmentNumber,
            segmentInfo.duration,
            validation
          );
          
          // 검증 실패 시에도 일단 true 반환 (경고만)
          if (!validation.isValid) {
            logger.warn(
              `Segment ${segmentInfo.segmentNumber} validation failed but continuing...`
            );
          }
        } catch (error) {
          logger.warn(`Segment validation error (non-fatal): ${error}`);
        }
        
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
 * 핵심 옵션 (속도 최적화):
 * - -ss (입력 전): 초고속 keyframe seek (keyframe-aligned 세그먼트 사용 시 정확함)
 * - -t: 정확한 인코딩 길이
 * - -force_key_frames: 세그먼트 시작을 keyframe으로 강제
 * - -f mpegts: MPEG-TS 출력 (HLS 세그먼트 포맷)
 * 
 * AccurateSegmentInfo를 사용하므로 입력 전 -ss로도 정확합니다.
 * (keyframe 경계에서 잘리기 때문에 keyframe seek = frame-accurate seek)
 */
function buildSegmentFFmpegArgs(
  mediaPath: string,
  segmentInfo: SegmentInfo | AccurateSegmentInfo,
  profile: QualityProfile,
  analysis: MediaAnalysis,
  outputPath: string
): string[] {
  const args: string[] = [];

  // 1. 에러 복원 옵션 (손상된 파일 대응)
  args.push(...getErrorResilienceArgs());

  // 2. 🚀 초고속 SEEK (입력 전 -ss)
  // keyframe-aligned 세그먼트를 사용하므로 keyframe seek로 충분
  // 입력 후 -ss 대비 10~100배 빠름!
  if (segmentInfo.startTime > 0) {
    args.push('-ss', segmentInfo.startTime.toFixed(3));
  }
  
  // 3. 입력 파일
  args.push('-i', normalizePathForFFmpeg(mediaPath));

  // 4. 인코딩 길이 제한
  args.push('-t', segmentInfo.duration.toFixed(3));

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
  
  // 비디오 인코더 옵션 추가
  const videoEncoderArgs = buildVideoEncoderArgs(profile, analysis);
  
  // force_key_frames를 단일 세그먼트용으로 재정의
  // (buildVideoEncoderArgs의 force_key_frames를 덮어씀)
  const filteredArgs: string[] = [];
  let skipNext = false;
  
  for (let i = 0; i < videoEncoderArgs.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    
    if (videoEncoderArgs[i] === '-force_key_frames') {
      skipNext = true; // 다음 인자(값) 스킵
      continue;
    }
    
    filteredArgs.push(videoEncoderArgs[i]);
  }
  
  args.push(...filteredArgs);

  // 8. 단일 세그먼트용 keyframe 설정 (첫 프레임만 강제)
  // 세그먼트 시작을 keyframe으로 만들어 독립 디코딩 보장
  args.push('-force_key_frames', 'expr:eq(n,0)');

  // 9. 오디오 인코딩 옵션
  args.push(...buildAudioEncoderArgs(profile, analysis));

  // 10. 오디오가 없고 무음을 생성한 경우
  if (!analysis.hasAudio) {
    args.push('-shortest'); // 비디오 길이에 맞춤
  }

  // 11. MPEG-TS 타임스탬프 정규화 (HLS 필수!)
  // HLS 스펙: 각 세그먼트의 PTS/DTS는 0부터 시작해야 함
  // -ss로 seek한 경우에도 출력 타임스탬프를 0으로 리셋
  args.push('-avoid_negative_ts', 'make_zero'); // PTS/DTS를 0 기준으로 조정
  args.push('-start_at_zero'); // 출력을 0부터 시작
  args.push('-output_ts_offset', '0'); // 출력 타임스탬프 오프셋 명시적으로 0
  // 세그먼트 경계에서의 복호 안정성을 위해 TS 플래그/뮤텍서 지연 최소화
  args.push('-mpegts_flags', '+resend_headers+initial_discontinuity');
  args.push('-muxpreload', '0');
  args.push('-muxdelay', '0');

  // 12. MPEG-TS 출력 (HLS 세그먼트 포맷)
  args.push('-f', 'mpegts');

  // 13. 출력 파일
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

