import type { QualityProfile, MediaInfo } from '../types.js';
//------------------------------------------------------------------------------//

/**
 * 표준 품질 프로파일 정의
 * 
 * 단일 품질로 단순화 - 원본 해상도에 맞춰 선택
 */
const QUALITY_PROFILES: Record<string, QualityProfile> = {
  '1080p': {
    name: '1080p',
    width: 1920,
    height: 1080,
    videoBitrate: '5M',
    audioBitrate: '128k',
    maxrate: '6M',
    bufsize: '12M',
  },
  '720p': {
    name: '720p',
    width: 1280,
    height: 720,
    videoBitrate: '3M',
    audioBitrate: '128k',
    maxrate: '3.5M',
    bufsize: '6M',
  },
  '480p': {
    name: '480p',
    width: 854,
    height: 480,
    videoBitrate: '1500k',
    audioBitrate: '128k',
    maxrate: '1750k',
    bufsize: '3M',
  },
  '360p': {
    name: '360p',
    width: 640,
    height: 360,
    videoBitrate: '800k',
    audioBitrate: '96k',
    maxrate: '950k',
    bufsize: '1.5M',
  },
};

/**
 * 원본 해상도를 기반으로 최적의 단일 품질 프로파일을 선택합니다.
 * 
 * 전략:
 * - 원본 해상도보다 낮거나 같은 최대 품질 선택
 * - 업스케일링 방지
 * - 최소 360p 보장
 */
export function selectOptimalProfile(mediaInfo: MediaInfo): QualityProfile {
  const width = mediaInfo.width || 0;
  const height = mediaInfo.height || 0;

  // 원본 해상도가 없으면 720p 기본값
  if (!width || !height) {
    return QUALITY_PROFILES['720p'];
  }

  // 원본 해상도에 맞는 최적 프로파일 선택
  if (width >= 1920 && height >= 1080) {
    return QUALITY_PROFILES['1080p'];
  } else if (width >= 1280 && height >= 720) {
    return QUALITY_PROFILES['720p'];
  } else if (width >= 854 && height >= 480) {
    return QUALITY_PROFILES['480p'];
  } else {
    return QUALITY_PROFILES['360p'];
  }
}

/**
 * 커스텀 프로파일 생성 (특수한 해상도)
 */
export function createCustomProfile(width: number, height: number): QualityProfile {
  // 픽셀 수 기반 비트레이트 계산 (대략적)
  const pixels = width * height;
  let videoBitrate: string;
  let audioBitrate: string;
  let maxrate: string;
  let bufsize: string;

  if (pixels >= 2073600) { // 1920x1080
    videoBitrate = '5M';
    audioBitrate = '128k';
    maxrate = '6M';
    bufsize = '12M';
  } else if (pixels >= 921600) { // 1280x720
    videoBitrate = '3M';
    audioBitrate = '128k';
    maxrate = '3.5M';
    bufsize = '6M';
  } else if (pixels >= 409920) { // 854x480
    videoBitrate = '1500k';
    audioBitrate = '128k';
    maxrate = '1750k';
    bufsize = '3M';
  } else {
    videoBitrate = '800k';
    audioBitrate = '96k';
    maxrate = '950k';
    bufsize = '1.5M';
  }

  return {
    name: `${width}x${height}`,
    width,
    height,
    videoBitrate,
    audioBitrate,
    maxrate,
    bufsize,
  };
}

/**
 * HLS 공통 설정
 * 
 * 최적화된 설정:
 * - 6초 세그먼트: 버퍼링 감소, 탐색 정확도 개선
 * - 독립 세그먼트: 각 세그먼트가 독립적으로 디코딩 가능
 */
export const HLS_CONFIG = {
  segmentTime: 6,              // 세그먼트 길이 (초) - 4초보다 안정적
  listSize: 0,                 // 모든 세그먼트 유지 (VOD)
  segmentType: 'mpegts',       // MPEG-TS (호환성 우수)
  flags: 'independent_segments+temp_file',
  startNumber: 0,
} as const;

/**
 * GOP (Group of Pictures) 설정
 * 키프레임 간격을 HLS 세그먼트와 동기화
 * 
 * 세그먼트와 GOP가 정렬되어야 탐색이 정확합니다.
 */
export function getGOPSize(fps: number = 24): number {
  // 세그먼트 시간(6초)에 맞춰 GOP 설정
  // 정확한 탐색을 위해 세그먼트와 동기화
  return Math.round(fps * HLS_CONFIG.segmentTime);
}

/**
 * 키프레임 간격 표현식
 * FFmpeg의 force_key_frames에 사용
 */
export function getKeyframeExpression(): string {
  return `expr:gte(t,n_forced*${HLS_CONFIG.segmentTime})`;
}

