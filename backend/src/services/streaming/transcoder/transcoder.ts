import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { logger } from '../../../utils/index.js';
import {
  buildVideoEncoderArgs,
  buildAudioEncoderArgs,
  buildVideoFilter,
  getErrorResilienceArgs,
  getInputArgs,
} from './encoder.options.js';
import { HLS_CONFIG } from './ffmpeg.config.js';
import type { TranscodeMethod, QualityProfile, FFmpegProcessResult, MediaAnalysis } from '../types.js';
//------------------------------------------------------------------------------//

const ffmpegPath = ffmpegInstaller.path;

/**
 * 단일 품질 HLS 트랜스코딩 시작
 * 
 * ABR 제거하고 단순하지만 강력한 단일 품질 트랜스코딩
 * 
 * @param mediaPath 원본 미디어 파일 경로
 * @param outputDir 출력 디렉터리
 * @param profile 품질 프로파일
 * @param transcodeMethod 트랜스코딩 방식 (cpu/nvenc/qsv)
 * @param analysis 미디어 분석 결과
 * @returns FFmpeg 프로세스 및 플레이리스트 경로
 */
export async function startTranscoding(
  mediaPath: string,
  outputDir: string,
  profile: QualityProfile,
  transcodeMethod: TranscodeMethod,
  analysis: MediaAnalysis
): Promise<FFmpegProcessResult | null> {
  const playlistPath = path.join(outputDir, 'playlist.m3u8');

  logger.info(`Starting HLS transcoding with ${transcodeMethod.toUpperCase()} encoder`);
  logger.info(`Quality: ${profile.name} (${profile.width}x${profile.height})`);
  logger.info(`Input codec: ${analysis.inputFormat.videoCodec}, Audio: ${analysis.inputFormat.audioCodec || 'none'}`);

  // FFmpeg 명령어 구성
  const ffmpegArgs = buildFFmpegArgs(mediaPath, outputDir, profile, transcodeMethod, analysis);

  // 디버그: 커맨드 로깅
  logger.debug?.(`FFmpeg command: ${ffmpegPath} ${ffmpegArgs.join(' ')}`);

  // FFmpeg 프로세스 시작
  const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],  // stdin 무시, stdout/stderr 파이프
  });

  // GPU 인코더 실패 감지
  let encoderInitFailed = false;
  let ffmpegOutput = '';

  ffmpegProcess.stderr?.on('data', data => {
    const message = data.toString();
    ffmpegOutput += message;

    // GPU 인코더 초기화 실패 감지
    if (isEncoderInitializationError(message, transcodeMethod)) {
      encoderInitFailed = true;
      logger.error(`Encoder initialization failed: ${message.trim()}`);
    }

    // 에러 메시지 로깅 (심각한 것만)
    if (isCriticalError(message)) {
      logger.error(`FFmpeg critical error: ${message.trim()}`);
    }

    // 진행 상황 로깅 (info는 제외)
    if (message.includes('time=') && message.includes('speed=')) {
      // 진행 상황은 debug 레벨로
      logger.debug?.(message.trim());
    }
  });

  ffmpegProcess.stdout?.on('data', data => {
    // stdout도 캡처 (일부 에러가 여기 나올 수 있음)
    ffmpegOutput += data.toString();
  });

  // 프로세스 시작 대기 (GPU는 초기화 시간 필요)
  const waitTime = transcodeMethod === 'cpu' ? 1000 : 1500;
  await new Promise(resolve => setTimeout(resolve, waitTime));

  // GPU 인코더 실패 확인
  if (encoderInitFailed) {
    logger.warn(`${transcodeMethod.toUpperCase()} encoder initialization failed, will fallback to CPU`);
    try {
      ffmpegProcess.kill('SIGKILL');
    } catch {
      // 이미 종료된 경우 무시
    }
    await new Promise(resolve => setTimeout(resolve, 200));
    return null;
  }

  // 프로세스가 즉시 종료되었는지 확인
  if (ffmpegProcess.exitCode !== null) {
    // exit code 0 = 성공 (짧은 비디오는 빠르게 완료될 수 있음)
    if (ffmpegProcess.exitCode === 0) {
      logger.info('FFmpeg process completed quickly (short video or fast encoding)');
      return {
        process: ffmpegProcess,
        playlistPath,
        profile,
      };
    }
    
    // 0이 아닌 exit code는 실패
    logger.error(`FFmpeg process failed with exit code ${ffmpegProcess.exitCode}`);
    logger.error(`Output:\n${ffmpegOutput}`);
    return null;
  }

  // 프로세스 이벤트 핸들러
  ffmpegProcess.on('error', error => {
    logger.error('Failed to start FFmpeg process:', error);
  });

  ffmpegProcess.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      logger.warn(`FFmpeg process exited with code ${code}`);
      if (signal) {
        logger.warn(`Killed by signal: ${signal}`);
      }
      // 중요한 에러만 로깅
      const errorLines = ffmpegOutput
        .split('\n')
        .filter(line => isCriticalError(line))
        .slice(-10);  // 마지막 10줄만
      if (errorLines.length > 0) {
        logger.error(`Last errors:\n${errorLines.join('\n')}`);
      }
    } else if (code === 0) {
      logger.success('FFmpeg transcoding completed successfully');
    }
  });

  logger.success('FFmpeg process started successfully');

  return {
    process: ffmpegProcess,
    playlistPath,
    profile,
  };
}

/**
 * FFmpeg 인자 생성 (단일 품질)
 * 
 * 메타데이터 기반 최적화된 커맨드 빌드
 */
function buildFFmpegArgs(
  mediaPath: string,
  outputDir: string,
  profile: QualityProfile,
  transcodeMethod: TranscodeMethod,
  analysis: MediaAnalysis
): string[] {
  const args: string[] = [];

  // 1. 입력 옵션 (안정적인 디코딩)
  args.push(...getInputArgs());

  // 2. 에러 복원 옵션 (손상된 파일 대응)
  args.push(...getErrorResilienceArgs());

  // 3. 입력 파일
  args.push('-i', mediaPath);

  // 4. 오디오가 없는 경우 무음 생성
  if (!analysis.hasAudio) {
    args.push('-f', 'lavfi');
    args.push('-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  }

  // 5. 비디오 인코딩 옵션
  const videoFilter = buildVideoFilter(profile, analysis);
  if (videoFilter !== 'null') {
    args.push('-vf', videoFilter);
  }
  args.push(...buildVideoEncoderArgs(transcodeMethod, profile, analysis));

  // 6. 오디오 인코딩 옵션
  const audioArgs = buildAudioEncoderArgs(profile, analysis);
  args.push(...audioArgs);

  // 오디오가 없고 무음을 생성한 경우
  if (!analysis.hasAudio) {
    args.push('-shortest');  // 비디오 길이에 맞춤
  }

  // 7. HLS 출력 옵션
  args.push(
    '-f', 'hls',
    '-hls_time', HLS_CONFIG.segmentTime.toString(),
    '-hls_list_size', HLS_CONFIG.listSize.toString(),
    '-hls_segment_type', HLS_CONFIG.segmentType,
    '-hls_flags', HLS_CONFIG.flags,
    '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts'),
  );

  // 8. 출력 파일
  args.push(path.join(outputDir, 'playlist.m3u8'));

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
    'Error initializing',
    'unknown encoder',
    'does not support',
    'No NVENC capable devices found',
    'cannot open the link',
    'Failed to query',
  ];

  return errorPatterns.some(pattern => message.includes(pattern));
}

/**
 * 심각한 에러 감지 (로깅할 가치가 있는 에러)
 */
function isCriticalError(message: string): boolean {
  const lowerMsg = message.toLowerCase();
  
  // 무시할 일반적인 경고 (심각하지 않은 것들)
  const ignorePatterns = [
    'deprecated',
    'past duration',
    'non-monotonous dts',
    'last message repeated',
    'cannot use rename',        // Windows 경로 관련 무해한 경고
    'data is not aligned',      // 성능 경고 (무해)
    'opening',                   // 파일 열기 정보
  ];

  if (ignorePatterns.some(pattern => lowerMsg.includes(pattern))) {
    return false;
  }

  // 심각한 에러 패턴
  const criticalPatterns = [
    'error',
    'failed',
    'cannot',
    'invalid',
    'not found',
    'unable to',
  ];

  return criticalPatterns.some(pattern => lowerMsg.includes(pattern));
}

/**
 * FFmpeg 프로세스 종료
 */
export async function killFFmpegProcess(process: ChildProcess): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      try {
        process.kill('SIGKILL');
        logger.warn('Force killed FFmpeg process (SIGKILL)');
      } catch {
        // 이미 종료된 경우 무시
      }
      resolve();
    }, 5000);

    process.once('exit', () => {
      clearTimeout(timeout);
      logger.info('FFmpeg process terminated gracefully');
      resolve();
    });

    process.once('error', err => {
      clearTimeout(timeout);
      reject(err);
    });

    if (!process.killed && process.exitCode === null) {
      try {
        process.kill('SIGTERM');
        logger.info('Sent SIGTERM to FFmpeg process');
      } catch {
        // 프로세스가 없으면 무시
        resolve();
      }
    } else {
      clearTimeout(timeout);
      resolve();
    }
  });
}
