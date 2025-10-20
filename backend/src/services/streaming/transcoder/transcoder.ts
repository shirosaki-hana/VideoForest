import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { logger, getFFmpegPath } from '../../../utils/index.js';
import { buildVideoEncoderArgs, buildAudioEncoderArgs, buildVideoFilter, getErrorResilienceArgs, getInputArgs } from './encoder.options.js';
import { HLS_CONFIG } from './ffmpeg.config.js';
import type { TranscodeMethod, QualityProfile, FFmpegProcessResult, MediaAnalysis } from '../types.js';
//------------------------------------------------------------------------------//

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

  // FFmpeg 경로 가져오기 (시스템 FFmpeg 우선)
  const ffmpegPath = getFFmpegPath();

  // 디버그: 커맨드 로깅
  logger.debug?.(`FFmpeg command: ${ffmpegPath} ${ffmpegArgs.join(' ')}`);

  // FFmpeg 프로세스 시작
  const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
    stdio: ['ignore', 'pipe', 'pipe'], // stdin 무시, stdout/stderr 파이프
  });

  // GPU 인코더 실패 감지
  let encoderInitFailed = false;
  let ffmpegOutput = '';
  const MAX_OUTPUT_SIZE = 50000; // 최대 50KB까지만 저장 (메모리 누수 방지)

  ffmpegProcess.stderr?.on('data', data => {
    const message = data.toString();

    // 메모리 누수 방지: 출력 크기 제한
    if (ffmpegOutput.length < MAX_OUTPUT_SIZE) {
      ffmpegOutput += message;
    } else if (ffmpegOutput.length < MAX_OUTPUT_SIZE + 1000) {
      // 한 번만 경고
      ffmpegOutput += '\n... (output truncated to prevent memory overflow) ...';
    }

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
    const output = data.toString();
    if (ffmpegOutput.length < MAX_OUTPUT_SIZE) {
      ffmpegOutput += output;
    }
  });

  // 프로세스 시작 대기 (GPU는 초기화 시간 필요)
  const waitTime = transcodeMethod === 'cpu' ? 1000 : 1500;
  await new Promise(resolve => setTimeout(resolve, waitTime));

  // GPU 인코더 실패 확인
  if (encoderInitFailed) {
    logger.error(`${transcodeMethod.toUpperCase()} encoder initialization failed. GPU encoding is not available.`);
    logger.error(`Please verify GPU drivers and hardware support for ${transcodeMethod.toUpperCase()}`);
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
        .slice(-10); // 마지막 10줄만
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

  // 3. 입력 파일 (Windows 경로 정규화)
  args.push('-i', normalizePathForFFmpeg(mediaPath));

  // 4. 오디오가 없는 경우 무음 생성
  if (!analysis.hasAudio) {
    args.push('-f', 'lavfi');
    args.push('-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  }

  // 5. 스트림 매핑 (명시적으로 지정)
  // HLS는 비디오/오디오만 지원 - 자막, 첨부 파일 등은 제외
  if (!analysis.hasAudio) {
    // 무음 오디오 사용: 비디오는 첫 번째 입력, 오디오는 두 번째 입력
    args.push('-map', '0:v:0'); // 첫 번째 입력의 비디오
    args.push('-map', '1:a:0'); // 두 번째 입력의 오디오 (무음)
  } else {
    // 일반 케이스: 비디오와 오디오만 선택 (자막, 첨부 파일 제외)
    args.push('-map', '0:v:0'); // 첫 번째 비디오 스트림
    args.push('-map', '0:a:0'); // 첫 번째 오디오 스트림
  }

  // 6. 비디오 인코딩 옵션
  const videoFilter = buildVideoFilter(profile, analysis);
  if (videoFilter !== 'null') {
    args.push('-vf', videoFilter);
  }
  args.push(...buildVideoEncoderArgs(transcodeMethod, profile, analysis));

  // 7. 오디오 인코딩 옵션
  const audioArgs = buildAudioEncoderArgs(profile, analysis);
  args.push(...audioArgs);

  // 오디오가 없고 무음을 생성한 경우
  if (!analysis.hasAudio) {
    args.push('-shortest'); // 비디오 길이에 맞춤
  }

  // 8. HLS 출력 옵션 (동적 세그먼트 시간 사용)
  const segmentTime = analysis.segmentTime;
  args.push(
    '-f',
    'hls',
    '-hls_time',
    segmentTime.toString(),
    '-hls_list_size',
    HLS_CONFIG.listSize.toString(),
    '-hls_segment_type',
    HLS_CONFIG.segmentType,
    '-hls_flags',
    HLS_CONFIG.flags,
    '-hls_segment_filename',
    normalizePathForFFmpeg(path.join(outputDir, 'segment_%03d.ts'))
  );

  // 9. 출력 파일
  args.push(normalizePathForFFmpeg(path.join(outputDir, 'playlist.m3u8')));

  return args;
}

/**
 * Windows 경로를 FFmpeg가 이해할 수 있는 형식으로 정규화
 *
 * Windows의 역슬래시를 슬래시로 변환하여 FFmpeg 호환성 보장
 */
function normalizePathForFFmpeg(filePath: string): string {
  // Windows 경로를 Unix 스타일로 변환 (FFmpeg는 둘 다 인식)
  return filePath.replace(/\\/g, '/');
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
    'cannot use rename', // Windows 경로 관련 무해한 경고
    'data is not aligned', // 성능 경고 (무해)
    'opening', // 파일 열기 정보
  ];

  if (ignorePatterns.some(pattern => lowerMsg.includes(pattern))) {
    return false;
  }

  // 심각한 에러 패턴
  const criticalPatterns = ['error', 'failed', 'cannot', 'invalid', 'not found', 'unable to'];

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
