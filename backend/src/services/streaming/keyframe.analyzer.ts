import { executeFFprobe } from '../../utils/index.js';
import { logger } from '../../utils/index.js';
import path from 'path';
//------------------------------------------------------------------------------//

/**
 * 키프레임 정보
 */
export interface KeyframeInfo {
  /** 키프레임 번호 (0부터 시작) */
  index: number;
  /** 타임스탬프 (초 단위, 소수점 6자리) */
  pts: number;
  /** 프레임 번호 */
  frameNumber: number;
}

/**
 * 키프레임 분석 결과
 */
export interface KeyframeAnalysis {
  /** 모든 키프레임 목록 */
  keyframes: KeyframeInfo[];
  /** 평균 GOP 크기 (프레임 수) */
  averageGopSize: number;
  /** 평균 GOP 시간 (초) */
  averageGopDuration: number;
  /** 총 키프레임 개수 */
  totalKeyframes: number;
  /** 전체 duration (초) */
  totalDuration: number;
  /** FPS */
  fps: number;
}

/**
 * FFprobe로 모든 키프레임 타임스탬프 추출
 * 
 * 핵심 아이디어:
 * - `-show_packets`로 모든 패킷 정보 가져오기
 * - `flags=K`인 패킷만 필터링 (키프레임)
 * - `pts_time`으로 정확한 타임스탬프 얻기
 * 
 * @param mediaPath 원본 미디어 파일 경로
 * @returns 키프레임 분석 결과
 */
export async function analyzeKeyframes(mediaPath: string): Promise<KeyframeAnalysis> {
  logger.info(`Analyzing keyframes for ${path.basename(mediaPath)}...`);

  try {
    // 1. FFprobe로 비디오 패킷 정보 추출 (키프레임만)
    const { stdout } = await executeFFprobe(
      [
        '-v', 'error',
        '-select_streams', 'v:0', // 첫 번째 비디오 스트림만
        '-show_entries', 'packet=pts_time,flags', // 타임스탬프와 플래그
        '-of', 'json', // JSON 출력
        '-read_intervals', '%+#9999999', // 모든 패킷 읽기
        path.resolve(mediaPath),
      ],
      {
        timeout: 60000, // 60초 타임아웃 (긴 영상 대응)
        maxBuffer: 10 * 1024 * 1024, // 10MB 버퍼
      }
    );

    const result = JSON.parse(stdout);
    const packets = result.packets || [];

    // 2. 키프레임만 필터링 (flags에 'K' 포함)
    const keyframePackets = packets.filter((pkt: any) => {
      return pkt.flags && pkt.flags.includes('K');
    });

    if (keyframePackets.length === 0) {
      throw new Error('No keyframes found in video');
    }

    // 3. 키프레임 정보 변환
    const keyframes: KeyframeInfo[] = keyframePackets.map((pkt: any, index: number) => ({
      index,
      pts: parseFloat(pkt.pts_time),
      frameNumber: -1, // 프레임 번호는 별도 계산 필요 (선택사항)
    }));

    // 4. 통계 계산
    const totalKeyframes = keyframes.length;
    const totalDuration = keyframes[keyframes.length - 1].pts;

    // GOP 크기 계산 (키프레임 간 간격)
    const gopDurations: number[] = [];
    for (let i = 1; i < keyframes.length; i++) {
      gopDurations.push(keyframes[i].pts - keyframes[i - 1].pts);
    }

    const averageGopDuration = gopDurations.length > 0
      ? gopDurations.reduce((a, b) => a + b, 0) / gopDurations.length
      : 0;

    // FPS 추출 (별도 FFprobe 호출)
    const fps = await extractFPS(mediaPath);

    const averageGopSize = Math.round(averageGopDuration * fps);

    logger.success(
      `Found ${totalKeyframes} keyframes ` +
      `(avg GOP: ${averageGopDuration.toFixed(2)}s / ${averageGopSize} frames)`
    );

    return {
      keyframes,
      averageGopSize,
      averageGopDuration,
      totalKeyframes,
      totalDuration,
      fps,
    };
  } catch (error) {
    logger.error(`Failed to analyze keyframes: ${error}`);
    throw error;
  }
}

/**
 * FPS 추출 (간단 버전)
 */
async function extractFPS(mediaPath: string): Promise<number> {
  try {
    const { stdout } = await executeFFprobe(
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=r_frame_rate',
        '-of', 'json',
        path.resolve(mediaPath),
      ],
      {
        timeout: 10000,
        maxBuffer: 512 * 1024,
      }
    );

    const result = JSON.parse(stdout);
    const stream = result.streams?.[0];
    
    if (stream?.r_frame_rate) {
      const [num, den] = stream.r_frame_rate.split('/').map(Number);
      if (den && den !== 0) {
        return num / den;
      }
    }

    // 기본값
    return 24;
  } catch (error) {
    logger.warn(`Failed to extract FPS, using default 24: ${error}`);
    return 24;
  }
}

/**
 * 특정 시간 근처의 키프레임 찾기
 * 
 * @param keyframes 키프레임 목록
 * @param targetTime 목표 시간 (초)
 * @param direction 'before' | 'after' | 'nearest'
 * @returns 찾은 키프레임 (없으면 null)
 */
export function findKeyframeNear(
  keyframes: KeyframeInfo[],
  targetTime: number,
  direction: 'before' | 'after' | 'nearest' = 'nearest'
): KeyframeInfo | null {
  if (keyframes.length === 0) return null;

  if (direction === 'before') {
    // targetTime 이전의 가장 가까운 키프레임
    for (let i = keyframes.length - 1; i >= 0; i--) {
      if (keyframes[i].pts <= targetTime) {
        return keyframes[i];
      }
    }
    return keyframes[0]; // 모두 이후면 첫 번째
  }

  if (direction === 'after') {
    // targetTime 이후의 가장 가까운 키프레임
    for (let i = 0; i < keyframes.length; i++) {
      if (keyframes[i].pts >= targetTime) {
        return keyframes[i];
      }
    }
    return keyframes[keyframes.length - 1]; // 모두 이전이면 마지막
  }

  // nearest: 가장 가까운 키프레임
  let minDiff = Infinity;
  let nearest: KeyframeInfo | null = null;

  for (const kf of keyframes) {
    const diff = Math.abs(kf.pts - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = kf;
    }
  }

  return nearest;
}

/**
 * 키프레임 간격 검증
 * 
 * GOP가 너무 크거나 불규칙하면 경고
 */
export function validateKeyframeStructure(analysis: KeyframeAnalysis): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // 1. GOP 크기가 너무 크면 경고 (10초 이상)
  if (analysis.averageGopDuration > 10) {
    warnings.push(
      `GOP duration is very large (${analysis.averageGopDuration.toFixed(2)}s). ` +
      `This may cause seek issues and increase JIT transcoding latency.`
    );
  }

  // 2. 키프레임이 너무 적으면 경고 (30초당 1개 미만)
  const keyframesPerMinute = (analysis.totalKeyframes / analysis.totalDuration) * 60;
  if (keyframesPerMinute < 2) {
    warnings.push(
      `Very few keyframes (${keyframesPerMinute.toFixed(1)}/min). ` +
      `Seeking will be imprecise.`
    );
  }

  // 3. 첫 프레임이 키프레임이 아니면 경고
  if (analysis.keyframes[0].pts > 0.1) {
    warnings.push('First frame is not a keyframe. Playback may not start properly.');
  }

  const isValid = warnings.length === 0;

  if (!isValid) {
    warnings.forEach(w => logger.warn(w));
  }

  return { isValid, warnings };
}

