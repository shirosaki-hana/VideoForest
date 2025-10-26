import { KeyframeInfo, findKeyframeNear } from './keyframe.analyzer.js';
import { logger } from '../../utils/index.js';
//------------------------------------------------------------------------------//

/**
 * 정확한 세그먼트 정보 (키프레임 기반)
 */
export interface AccurateSegmentInfo {
  /** 세그먼트 번호 (0부터 시작) */
  segmentNumber: number;
  /** 정확한 시작 시간 (키프레임 PTS) */
  startTime: number;
  /** 정확한 종료 시간 (다음 키프레임 PTS) */
  endTime: number;
  /** 실제 duration (초) */
  duration: number;
  /** 시작 키프레임 인덱스 */
  startKeyframeIndex: number;
  /** 종료 키프레임 인덱스 (exclusive) */
  endKeyframeIndex: number;
  /** 파일명 */
  fileName: string;
}

/**
 * 세그먼트 계산 결과
 */
export interface SegmentCalculationResult {
  /** 정확한 세그먼트 목록 */
  segments: AccurateSegmentInfo[];
  /** 전체 세그먼트 개수 */
  totalSegments: number;
  /** 평균 세그먼트 duration */
  averageSegmentDuration: number;
  /** 최소 세그먼트 duration */
  minSegmentDuration: number;
  /** 최대 세그먼트 duration */
  maxSegmentDuration: number;
}

/**
 * 키프레임 기반으로 세그먼트 경계 계산
 * 
 * 핵심 아이디어:
 * - 목표 세그먼트 길이 (예: 6초) 근처의 키프레임을 찾아 경계로 사용
 * - 각 세그먼트는 반드시 키프레임으로 시작
 * - 실제 duration은 키프레임 간격에 따라 달라짐 (5.8초 ~ 6.2초 등)
 * 
 * @param keyframes 키프레임 목록
 * @param targetSegmentDuration 목표 세그먼트 길이 (초)
 * @param totalDuration 전체 영상 길이 (초)
 * @returns 세그먼트 계산 결과
 */
export function calculateAccurateSegments(
  keyframes: KeyframeInfo[],
  targetSegmentDuration: number,
  totalDuration: number
): SegmentCalculationResult {
  if (keyframes.length === 0) {
    throw new Error('No keyframes provided');
  }

  logger.info(
    `Calculating accurate segments (target: ${targetSegmentDuration}s, ` +
    `${keyframes.length} keyframes)...`
  );

  const segments: AccurateSegmentInfo[] = [];
  let currentTime = 0;
  let segmentNumber = 0;

  // 각 세그먼트의 경계를 키프레임 기반으로 결정
  while (currentTime < totalDuration) {
    const targetEndTime = currentTime + targetSegmentDuration;

    // 현재 위치에서 가장 가까운 시작 키프레임
    const startKeyframe = findKeyframeNear(keyframes, currentTime, 'after');
    if (!startKeyframe) break;

    // 목표 종료 시간에서 가장 가까운 키프레임
    const endKeyframe = findKeyframeNear(keyframes, targetEndTime, 'after');
    
    // 마지막 세그먼트 처리
    let endTime: number;
    let endKeyframeIndex: number;
    
    if (!endKeyframe || endKeyframe.index === startKeyframe.index) {
      // 마지막 세그먼트이거나 키프레임이 하나뿐인 경우
      endTime = totalDuration;
      endKeyframeIndex = keyframes.length;
    } else {
      endTime = endKeyframe.pts;
      endKeyframeIndex = endKeyframe.index;
    }

    const duration = endTime - startKeyframe.pts;

    // 세그먼트가 너무 짧으면 스킵 (0.5초 미만)
    if (duration < 0.5) {
      currentTime = endTime;
      continue;
    }

    segments.push({
      segmentNumber,
      startTime: startKeyframe.pts,
      endTime,
      duration,
      startKeyframeIndex: startKeyframe.index,
      endKeyframeIndex,
      fileName: `segment_${segmentNumber.toString().padStart(3, '0')}.ts`,
    });

    currentTime = endTime;
    segmentNumber++;
  }

  // 통계 계산
  const durations = segments.map(s => s.duration);
  const averageSegmentDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const minSegmentDuration = Math.min(...durations);
  const maxSegmentDuration = Math.max(...durations);

  logger.success(
    `Calculated ${segments.length} segments ` +
    `(avg: ${averageSegmentDuration.toFixed(2)}s, ` +
    `min: ${minSegmentDuration.toFixed(2)}s, ` +
    `max: ${maxSegmentDuration.toFixed(2)}s)`
  );

  // 세그먼트가 목표와 너무 많이 다르면 경고
  const durationDiff = Math.abs(averageSegmentDuration - targetSegmentDuration);
  if (durationDiff > 1.0) {
    logger.warn(
      `Segment duration differs significantly from target ` +
      `(${durationDiff.toFixed(2)}s difference). ` +
      `Consider adjusting GOP size in encoder.`
    );
  }

  return {
    segments,
    totalSegments: segments.length,
    averageSegmentDuration,
    minSegmentDuration,
    maxSegmentDuration,
  };
}

/**
 * 세그먼트 번호로 정확한 세그먼트 정보 찾기
 */
export function getSegmentByNumber(
  segments: AccurateSegmentInfo[],
  segmentNumber: number
): AccurateSegmentInfo | null {
  return segments.find(s => s.segmentNumber === segmentNumber) || null;
}

/**
 * 특정 시간이 속한 세그먼트 찾기
 */
export function getSegmentAtTime(
  segments: AccurateSegmentInfo[],
  time: number
): AccurateSegmentInfo | null {
  return segments.find(s => s.startTime <= time && time < s.endTime) || null;
}

/**
 * 세그먼트 범위 검증
 * 
 * 겹침이나 간격이 있는지 확인
 */
export function validateSegmentContinuity(segments: AccurateSegmentInfo[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];

    // 이전 세그먼트의 끝과 현재 세그먼트의 시작이 연속적인지 확인
    const gap = Math.abs(curr.startTime - prev.endTime);
    
    if (gap > 0.1) {
      errors.push(
        `Gap detected between segment ${prev.segmentNumber} and ${curr.segmentNumber} ` +
        `(${gap.toFixed(3)}s)`
      );
    }

    // 겹침 확인
    if (curr.startTime < prev.endTime - 0.01) {
      errors.push(
        `Overlap detected between segment ${prev.segmentNumber} and ${curr.segmentNumber}`
      );
    }
  }

  if (errors.length > 0) {
    errors.forEach(e => logger.error(e));
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * HLS 플레이리스트용 세그먼트 정보 생성
 * 
 * @param segments 정확한 세그먼트 목록
 * @returns HLS #EXTINF 형식 문자열 배열
 */
export function generateHLSSegmentEntries(segments: AccurateSegmentInfo[]): string[] {
  return segments.map(segment => {
    // HLS 스펙: duration은 정수 또는 소수점 (최대 소수점 이하 3자리 권장)
    const durationStr = segment.duration.toFixed(3);
    return `#EXTINF:${durationStr},\n${segment.fileName}`;
  });
}

