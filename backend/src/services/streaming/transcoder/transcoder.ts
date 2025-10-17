import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { logger } from '../../../utils/index.js';
import { getVideoEncoderArgs, getAudioEncoderArgs, getVideoFilterArgs } from './encoder.options.js';
import { HLS_CONFIG } from './ffmpeg.config.js';
import type { TranscodeMethod, QualityProfile, FFmpegProcessResult } from '../types.js';
//------------------------------------------------------------------------------//

const ffmpegPath = ffmpegInstaller.path;

/**
 * ABR(Adaptive Bitrate) HLS 트랜스코딩을 위한 FFmpeg 프로세스 시작
 * 
 * @param mediaPath 원본 미디어 파일 경로
 * @param outputDir 출력 디렉터리
 * @param profiles 사용할 품질 프로파일 목록
 * @param transcodeMethod 트랜스코딩 방식 (cpu/nvenc/qsv)
 * @returns FFmpeg 프로세스 및 Master Playlist 경로
 */
export async function startABRTranscoding(
  mediaPath: string,
  outputDir: string,
  profiles: QualityProfile[],
  transcodeMethod: TranscodeMethod
): Promise<FFmpegProcessResult | null> {
  const masterPlaylistPath = path.join(outputDir, 'master.m3u8');

  logger.info(`Starting ABR transcoding with ${transcodeMethod.toUpperCase()} encoder`);
  logger.info(`Quality profiles: ${profiles.map(p => p.name).join(', ')}`);

  // FFmpeg 명령어 구성
  const ffmpegArgs = buildFFmpegArgs(mediaPath, outputDir, profiles, transcodeMethod);

  // FFmpeg 프로세스 시작
  const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

  // GPU 인코더 실패 감지
  let encoderInitFailed = false;
  let ffmpegOutput = '';

  ffmpegProcess.stderr?.on('data', data => {
    const message = data.toString();
    ffmpegOutput += message;

    // GPU 인코더 초기화 실패 감지
    if (isEncoderInitializationError(message, transcodeMethod)) {
      encoderInitFailed = true;
    }

    // 에러 메시지 로깅
    if (message.toLowerCase().includes('error')) {
      logger.error(`FFmpeg error: ${message.trim()}`);
    }
  });

  // 프로세스 시작 대기
  const waitTime = transcodeMethod === 'cpu' ? 1000 : 500;
  await new Promise(resolve => setTimeout(resolve, waitTime));

  // GPU 인코더 실패 확인
  if (encoderInitFailed) {
    logger.warn(`${transcodeMethod.toUpperCase()} encoder initialization failed`);
    try {
      ffmpegProcess.kill('SIGKILL');
    } catch (error) {
      // 이미 종료된 경우 무시
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    return null;
  }

  // 프로세스 이벤트 핸들러
  ffmpegProcess.on('error', error => {
    logger.error('Failed to start FFmpeg:', error);
  });

  ffmpegProcess.on('exit', code => {
    if (code !== 0 && code !== null) {
      logger.warn(`FFmpeg process exited with code ${code}`);
      if (ffmpegOutput) {
        logger.error(`FFmpeg output:\n${ffmpegOutput}`);
      }
    }
  });

  return {
    process: ffmpegProcess,
    masterPlaylistPath,
    qualityProfiles: profiles,
  };
}

/**
 * FFmpeg 인자 생성 (ABR 지원)
 * 
 * 각 품질별로 별도의 비디오/오디오 스트림을 생성하고
 * FFmpeg HLS muxer의 var_stream_map을 사용하여 ABR 구현
 */
function buildFFmpegArgs(
  mediaPath: string,
  outputDir: string,
  profiles: QualityProfile[],
  transcodeMethod: TranscodeMethod
): string[] {
  const args: string[] = [
    // 입력 옵션
    '-fflags', '+genpts+discardcorrupt',
    '-i', mediaPath,
    // 전역 옵션
    '-max_muxing_queue_size', '1024',
    '-max_interleave_delta', '0',
  ];

  // 각 품질별로 스트림 매핑 및 인코딩 설정
  profiles.forEach((profile, index) => {
    // 비디오 스트림 매핑
    args.push('-map', '0:v:0');
    // 비디오 스케일링 필터
    args.push(`-filter:v:${index}`, 
      `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,` +
      `pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2`
    );
    // 비디오 인코더 (스트림별)
    const videoEncoderArgs = getVideoEncoderArgs(transcodeMethod, profile);
    videoEncoderArgs.forEach(arg => {
      if (arg.startsWith('-')) {
        args.push(arg + ':' + index);
      } else {
        args.push(arg);
      }
    });
    
    // 오디오 스트림 매핑
    args.push('-map', '0:a:0');
    // 오디오 인코더 (스트림별)
    args.push(`-c:a:${index}`, 'aac');
    args.push(`-b:a:${index}`, profile.audioBitrate);
    args.push(`-ar:${index}`, '48000');
    args.push(`-ac:${index}`, '2');
  });

  // HLS 옵션
  args.push(
    '-f', 'hls',
    '-hls_time', HLS_CONFIG.segmentTime.toString(),
    '-hls_list_size', HLS_CONFIG.listSize.toString(),
    '-hls_segment_type', HLS_CONFIG.segmentType,
    '-hls_flags', HLS_CONFIG.flags,
    '-hls_segment_filename', path.join(outputDir, 'v%v', 'segment_%03d.ts'),
    '-master_pl_name', 'master.m3u8',
  );

  // Variant streams 정의 (각 품질별 v와 a 페어링)
  const variantStreams = profiles
    .map((profile, index) => `v:${index},a:${index}`)
    .join(' ');
  args.push('-var_stream_map', variantStreams);

  // 출력 패턴 (각 variant는 v0, v1, v2, v3 디렉토리에 저장)
  args.push(path.join(outputDir, 'v%v', 'playlist.m3u8'));

  return args;
}

/**
 * 인코더 초기화 에러 감지
 */
function isEncoderInitializationError(message: string, transcodeMethod: TranscodeMethod): boolean {
  if (transcodeMethod === 'cpu') {
    return false; // CPU는 항상 작동
  }

  const errorPatterns = [
    'Cannot load',
    'No capable devices found',
    'not available',
    'Failed to',
    'Unable to parse option',
    'Error setting option',
    'Error initializing output stream',
    'unknown encoder',
  ];

  return errorPatterns.some(pattern => message.includes(pattern));
}

/**
 * FFmpeg 프로세스 종료
 */
export async function killFFmpegProcess(process: ChildProcess): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      try {
        process.kill('SIGKILL');
        logger.warn('Force killed FFmpeg process');
      } catch (e) {
        // 이미 종료된 경우 무시
      }
      resolve();
    }, 5000);

    process.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    process.once('error', err => {
      clearTimeout(timeout);
      reject(err);
    });

    if (!process.killed) {
      process.kill('SIGTERM');
    }
  });
}

