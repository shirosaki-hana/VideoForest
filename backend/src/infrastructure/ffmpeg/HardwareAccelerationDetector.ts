import { spawn } from 'child_process';
import { logger, getFFmpegPath } from '../../utils/index.js';
//------------------------------------------------------------------------------//

/**
 * 하드웨어 가속 인코더 타입
 */
export type HWEncoderType = 'h264_nvenc' | 'libx264';

/**
 * 하드웨어 가속 감지 결과
 */
export interface HWAccelDetectionResult {
  available: HWEncoderType[];
  preferred: HWEncoderType;
  nvencAvailable: boolean;
  detectedAt: number;
}

/**
 * 하드웨어 가속 감지기
 *
 * 책임:
 * - 시스템에서 사용 가능한 하드웨어 인코더 감지
 * - NVENC (NVIDIA GPU) 가용성 확인
 * - 감지 결과 캐싱 (시스템 시작 시 한 번만 실행)
 */
export class HardwareAccelerationDetector {
  private static cachedResult: HWAccelDetectionResult | null = null;
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5분

  /**
   * 하드웨어 가속 감지 (캐시 사용)
   */
  static async detect(): Promise<HWAccelDetectionResult> {
    // 캐시 확인
    if (this.cachedResult) {
      const age = Date.now() - this.cachedResult.detectedAt;
      if (age < this.CACHE_DURATION) {
        logger.debug?.(`Using cached HW accel detection (age: ${Math.floor(age / 1000)}s)`);
        return this.cachedResult;
      }
    }

    logger.debug('Detecting hardware acceleration support...');

    const result: HWAccelDetectionResult = {
      available: ['libx264'], // CPU는 항상 사용 가능
      preferred: 'libx264',
      nvencAvailable: false,
      detectedAt: Date.now(),
    };

    // NVENC 감지
    const nvencAvailable = await this.testNVENC();
    if (nvencAvailable) {
      result.available.unshift('h264_nvenc'); // 맨 앞에 추가 (우선순위)
      result.preferred = 'h264_nvenc';
      result.nvencAvailable = true;
      logger.debug('✓ NVENC (NVIDIA GPU) available - will be used for encoding');
    } else {
      logger.debug('✗ NVENC not available - falling back to CPU (libx264)');
    }

    // 캐시 저장
    this.cachedResult = result;

    return result;
  }

  /**
   * NVENC 가용성 테스트
   *
   * 전략: 1초짜리 더미 비디오 인코딩 시도
   * - 성공: NVENC 사용 가능
   * - 실패: NVENC 불가 (드라이버 없음, GPU 없음 등)
   */
  private static async testNVENC(): Promise<boolean> {
    const ffmpegPath = getFFmpegPath();

    // 초경량 테스트: 1초짜리 검은 화면을 NVENC로 인코딩
    // -f lavfi: 가상 입력 (실제 파일 불필요)
    // color=black: 검은색 단색
    // s=256x144: 최소 해상도
    // d=1: 1초
    // -f null: 출력 버리기 (디스크 쓰기 없음)
    const args = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=black:s=256x144:d=1',
      '-c:v',
      'h264_nvenc',
      '-preset',
      'llhp', // Low Latency High Performance (구형 FFmpeg 호환)
      '-b:v',
      '100k',
      '-f',
      'null',
      '-',
    ];

    return new Promise<boolean>(resolve => {
      const process = spawn(ffmpegPath, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let stderr = '';

      process.stderr?.on('data', data => {
        stderr += data.toString();
      });

      // 타임아웃 설정 (5초)
      const timeout = setTimeout(() => {
        process.kill();
        logger.debug?.('NVENC test timed out');
        resolve(false);
      }, 5000);

      process.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });

      process.on('exit', code => {
        clearTimeout(timeout);

        if (code === 0) {
          logger.debug?.('NVENC test successful');
          resolve(true);
        } else {
          // 에러 메시지에서 유용한 정보 추출
          if (stderr.includes('No NVENC capable devices found')) {
            logger.debug?.('NVENC unavailable: No NVIDIA GPU found');
          } else if (stderr.includes('unsupported device')) {
            logger.debug?.('NVENC unavailable: GPU does not support NVENC (common on entry-level/mobile GPUs)');
          } else if (stderr.includes('Cannot load')) {
            logger.debug?.('NVENC unavailable: Driver or library issue');
          } else if (stderr.includes('Unknown encoder')) {
            logger.debug?.('NVENC unavailable: FFmpeg not compiled with NVENC support');
          } else {
            logger.debug?.(`NVENC test failed (exit ${code})`);
          }
          resolve(false);
        }
      });
    });
  }

  /**
   * 캐시 무효화 (테스트용)
   */
  static clearCache(): void {
    this.cachedResult = null;
    logger.debug?.('Hardware acceleration cache cleared');
  }

  /**
   * 캐시된 결과 조회 (감지 수행하지 않음)
   */
  static getCached(): HWAccelDetectionResult | null {
    return this.cachedResult;
  }
}
