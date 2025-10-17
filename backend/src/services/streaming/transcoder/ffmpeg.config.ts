import type { QualityProfile } from '../types.js';
//------------------------------------------------------------------------------//

/**
 * 표준 ABR 품질 프로파일 (4단계)
 * 
 * 1080p (5Mbps) - 고화질
 * 720p (2.5Mbps) - 중화질
 * 480p (1Mbps) - 저화질
 * 360p (500kbps) - 매우 저화질
 */
export const STANDARD_QUALITY_PROFILES: QualityProfile[] = [
  {
    name: '1080p',
    width: 1920,
    height: 1080,
    videoBitrate: '5M',
    audioBitrate: '128k',
    maxrate: '5.5M',
    bufsize: '10M',
  },
  {
    name: '720p',
    width: 1280,
    height: 720,
    videoBitrate: '2500k',
    audioBitrate: '128k',
    maxrate: '2750k',
    bufsize: '5M',
  },
  {
    name: '480p',
    width: 854,
    height: 480,
    videoBitrate: '1000k',
    audioBitrate: '96k',
    maxrate: '1100k',
    bufsize: '2M',
  },
  {
    name: '360p',
    width: 640,
    height: 360,
    videoBitrate: '500k',
    audioBitrate: '64k',
    maxrate: '550k',
    bufsize: '1M',
  },
];

/**
 * 원본 해상도를 기반으로 적절한 품질 프로파일을 선택합니다.
 * 원본보다 높은 해상도는 제외합니다.
 */
export function selectQualityProfiles(originalWidth: number | null, originalHeight: number | null): QualityProfile[] {
  // 원본 해상도 정보가 없으면 모든 프로파일 사용
  if (!originalWidth || !originalHeight) {
    return STANDARD_QUALITY_PROFILES;
  }

  // 원본 해상도보다 작거나 같은 프로파일만 선택
  const profiles = STANDARD_QUALITY_PROFILES.filter(
    profile => profile.width <= originalWidth && profile.height <= originalHeight
  );

  // 최소 1개의 프로파일은 반환 (원본이 매우 작은 경우)
  if (profiles.length === 0) {
    return [STANDARD_QUALITY_PROFILES[STANDARD_QUALITY_PROFILES.length - 1]];
  }

  return profiles;
}

/**
 * HLS 공통 설정
 */
export const HLS_CONFIG = {
  segmentTime: 4,              // 세그먼트 길이 (초)
  listSize: 0,                 // 모든 세그먼트 유지
  segmentType: 'mpegts',       // 세그먼트 타입
  flags: 'independent_segments+temp_file',
  startNumber: 0,
} as const;

/**
 * GOP (Group of Pictures) 설정
 * 키프레임 간격을 HLS 세그먼트와 동기화
 */
export function getGOPSize(fps: number = 24): number {
  // 2초마다 키프레임 (세그먼트 길이의 절반)
  return Math.round(fps * 2);
}

