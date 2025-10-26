import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { logger, getFFmpegPath } from '../../utils/index.js';
import {
  EncoderOptions,
  SegmentUtils,
  type QualityProfile,
  type MediaAnalysis,
  type SegmentInfo,
  type AccurateSegmentInfo,
  type VideoEncoderType,
} from '../../domain/streaming/index.js';
import { SegmentValidator } from './SegmentValidator.js';
import { HardwareAccelerationDetector } from './HardwareAccelerationDetector.js';

/**
 * FFmpeg 트랜스코더
 *
 * 책임:
 * - FFmpeg 프로세스 실행
 * - 세그먼트 파일 생성
 * - 캐시 관리
 * - GPU 가속 자동 감지 및 폴백
 *
 * Infrastructure Layer: 외부 도구(FFmpeg)에 대한 직접적인 의존성
 */
export class FFmpegTranscoder {
  private ffmpegPath: string;
  private speedMode: boolean;
  private preferredEncoder: VideoEncoderType | null = null;

  constructor(speedMode: boolean = false) {
    this.ffmpegPath = getFFmpegPath();
    this.speedMode = speedMode;
  }

  /**
   * 하드웨어 가속 초기화 (한 번만 실행)
   */
  private async initializeHardwareAcceleration(): Promise<VideoEncoderType> {
    if (this.preferredEncoder) {
      return this.preferredEncoder;
    }

    const detection = await HardwareAccelerationDetector.detect();
    this.preferredEncoder = detection.preferred;

    return this.preferredEncoder;
  }

  /**
   * 단일 세그먼트 JIT 트랜스코딩 (GPU 가속 자동 감지 + 폴백)
   *
   * 핵심 아이디어:
   * - FFmpeg의 -ss 옵션으로 정확한 시작 위치로 seek
   * - -t 옵션으로 정확한 길이만큼만 인코딩
   * - 완성된 세그먼트 파일을 디스크에 저장 (영구 캐싱)
   * - GPU 인코딩 실패 시 자동으로 CPU로 폴백
   */
  async transcodeSegment(
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
    const endTime = isAccurate ? (segmentInfo as AccurateSegmentInfo).endTime : segmentInfo.startTime + segmentInfo.duration;
    const duration = endTime - segmentInfo.startTime;

    logger.info(
      `JIT transcoding: segment ${segmentInfo.segmentNumber} ` +
        `(${segmentInfo.startTime.toFixed(3)}s ~ ${endTime.toFixed(3)}s) ` +
        `duration ${duration.toFixed(3)}s ` +
        `to ${profile.name}`
    );

    // 하드웨어 가속 초기화
    const preferredEncoder = await this.initializeHardwareAcceleration();

    // 우선 인코더로 시도
    const success = await this.tryTranscode(mediaPath, segmentInfo, profile, analysis, outputPath, preferredEncoder);

    if (success) {
      return true;
    }

    // GPU 인코딩 실패 시 CPU로 폴백
    if (preferredEncoder === 'h264_nvenc') {
      logger.warn(`NVENC encoding failed for segment ${segmentInfo.segmentNumber}, falling back to CPU...`);
      return await this.tryTranscode(mediaPath, segmentInfo, profile, analysis, outputPath, 'libx264');
    }

    return false;
  }

  /**
   * 특정 인코더로 트랜스코딩 시도
   */
  private async tryTranscode(
    mediaPath: string,
    segmentInfo: SegmentInfo | AccurateSegmentInfo,
    profile: QualityProfile,
    analysis: MediaAnalysis,
    outputPath: string,
    encoderType: VideoEncoderType
  ): Promise<boolean> {
    // FFmpeg 명령어 구성
    const ffmpegArgs = this.buildFFmpegArgs(mediaPath, segmentInfo, profile, analysis, outputPath, encoderType);

    // 인코더 정보 로그
    const encoderName = encoderType === 'h264_nvenc' ? 'NVENC (GPU)' : 'libx264 (CPU)';
    logger.debug?.(`Using encoder: ${encoderName}`);

    // FFmpeg 프로세스 실행 (동기적으로 완료 대기)
    return new Promise<boolean>(resolve => {
      const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';

      ffmpegProcess.stderr?.on('data', data => {
        stderr += data.toString();
      });

      ffmpegProcess.on('error', error => {
        logger.error(`FFmpeg process error: ${error.message}`);
        resolve(false);
      });

      ffmpegProcess.on('exit', async code => {
        if (code === 0) {
          // 성공 - 세그먼트 검증
          logger.success(`Segment ${segmentInfo.segmentNumber} transcoded successfully ` + `(${profile.name}, ${encoderName})`);

          // 세그먼트 품질 검증 (비동기, 에러 무시)
          try {
            const validator = new SegmentValidator();
            const validation = await validator.validate(outputPath);
            validator.logResult(segmentInfo.segmentNumber, segmentInfo.duration, validation);

            // 검증 실패 시에도 일단 true 반환 (경고만)
            if (!validation.isValid) {
              logger.warn(`Segment ${segmentInfo.segmentNumber} validation failed but continuing...`);
            }
          } catch (error) {
            logger.warn(`Segment validation error (non-fatal): ${error}`);
          }

          resolve(true);
        } else {
          // 실패
          logger.error(`Segment ${segmentInfo.segmentNumber} transcoding failed with ${encoderName} ` + `(exit code: ${code})`);

          // GPU 인코딩 실패 시 유용한 에러 정보 출력
          if (encoderType === 'h264_nvenc') {
            if (stderr.includes('No NVENC capable devices found')) {
              logger.error('NVENC error: No NVIDIA GPU found');
            } else if (stderr.includes('Cannot load')) {
              logger.error('NVENC error: Driver or library issue');
            } else if (stderr.includes('InitializeEncoder failed')) {
              logger.error('NVENC error: Encoder initialization failed');
            }
          }

          logger.debug?.(`FFmpeg stderr:\n${stderr.slice(-1000)}`); // 마지막 1000자만
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
   * - encoderType: GPU/CPU 인코더 선택
   */
  private buildFFmpegArgs(
    mediaPath: string,
    segmentInfo: SegmentInfo | AccurateSegmentInfo,
    profile: QualityProfile,
    analysis: MediaAnalysis,
    outputPath: string,
    encoderType: VideoEncoderType = 'libx264'
  ): string[] {
    const args: string[] = [];

    // 1. 전역 플래그
    args.push(...EncoderOptions.getGlobalArgs(this.speedMode));

    // 2. 에러 복원 옵션 (손상된 파일 대응)
    args.push(...EncoderOptions.getErrorResilienceArgs());

    // 3. 🚀 초고속 SEEK (입력 전 -ss)
    if (segmentInfo.startTime > 0) {
      args.push('-ss', segmentInfo.startTime.toFixed(3));
    }

    // 4. 입력 파일
    args.push('-i', this.normalizePathForFFmpeg(mediaPath));

    // 5. 인코딩 길이 제한
    args.push('-t', segmentInfo.duration.toFixed(3));

    // 6. 오디오가 없는 경우 무음 생성
    if (!analysis.hasAudio) {
      args.push('-f', 'lavfi');
      args.push('-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
    }

    // 7. 스트림 매핑
    if (!analysis.hasAudio) {
      args.push('-map', '0:v:0'); // 비디오
      args.push('-map', '1:a:0'); // 무음 오디오
    } else {
      args.push('-map', '0:v:0');
      args.push('-map', '0:a:0');
    }

    // 8. 비디오 인코딩 옵션
    const videoFilter = EncoderOptions.buildVideoFilter(profile, analysis);
    if (videoFilter !== 'null') {
      if (this.speedMode) {
        args.push('-sws_flags', 'fast_bilinear');
      }
      args.push('-vf', videoFilter);
    }

    // 비디오 인코더 옵션 추가 (GPU/CPU 선택)
    const videoEncoderArgs = EncoderOptions.buildVideoArgs(profile, analysis, this.speedMode, encoderType);

    // force_key_frames를 단일 세그먼트용으로 재정의
    const filteredArgs: string[] = [];
    let skipNext = false;

    for (let i = 0; i < videoEncoderArgs.length; i++) {
      if (skipNext) {
        skipNext = false;
        continue;
      }

      if (videoEncoderArgs[i] === '-force_key_frames') {
        skipNext = true;
        continue;
      }

      filteredArgs.push(videoEncoderArgs[i]);
    }

    args.push(...filteredArgs);

    // 9. 단일 세그먼트용 keyframe 설정 (첫 프레임만 강제)
    args.push('-force_key_frames', 'expr:eq(n,0)');

    // 10. 오디오 인코딩 옵션
    args.push(...EncoderOptions.buildAudioArgs(profile, analysis));

    // 11. 오디오가 없고 무음을 생성한 경우
    if (!analysis.hasAudio) {
      args.push('-shortest');
    }

    // 12. MPEG-TS 타임스탬프 정규화 (HLS 필수!)
    args.push('-avoid_negative_ts', 'make_zero');
    args.push('-start_at_zero');
    args.push('-output_ts_offset', '0');
    args.push('-mpegts_flags', '+resend_headers+initial_discontinuity');
    args.push('-muxpreload', '0');
    args.push('-muxdelay', '0');

    // 13. MPEG-TS 출력 (HLS 세그먼트 포맷)
    args.push('-f', 'mpegts');

    // 14. 출력 파일
    args.push(this.normalizePathForFFmpeg(outputPath));

    return args;
  }

  /**
   * Windows 경로를 FFmpeg가 이해할 수 있는 형식으로 정규화
   */
  private normalizePathForFFmpeg(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }

  /**
   * 세그먼트 캐시 확인
   */
  static checkCache(mediaId: string, quality: string, segmentNumber: number, baseDir: string = 'temp/hls'): string | null {
    const segmentPath = SegmentUtils.getPath(mediaId, quality, segmentNumber, baseDir);

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
  static isCached(mediaId: string, quality: string, segmentNumber: number, baseDir: string = 'temp/hls'): boolean {
    return this.checkCache(mediaId, quality, segmentNumber, baseDir) !== null;
  }
}

// 하위 호환성을 위한 함수 export
export const transcodeSegment = async (
  mediaPath: string,
  segmentInfo: SegmentInfo | AccurateSegmentInfo,
  profile: QualityProfile,
  analysis: MediaAnalysis,
  outputPath: string
): Promise<boolean> => {
  const transcoder = new FFmpegTranscoder();
  return transcoder.transcodeSegment(mediaPath, segmentInfo, profile, analysis, outputPath);
};

export const checkSegmentCache = FFmpegTranscoder.checkCache;
export const isSegmentCached = FFmpegTranscoder.isCached;
