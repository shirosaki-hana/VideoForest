import type { QualityProfile, MediaInfo } from '../types.js';

/**
 * 표준 품질 프로파일 정의
 *
 * ABR을 위한 다양한 품질 레벨
 */
export const QUALITY_PROFILES: Record<string, QualityProfile> = {
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
 * HLS 공통 설정
 *
 * 최적화된 설정:
 * - 6초 세그먼트: 버퍼링 감소, 탐색 정확도 개선
 * - 독립 세그먼트: 각 세그먼트가 독립적으로 디코딩 가능
 * - VOD 플레이리스트 타입: JIT 트랜스코딩에서도 VOD로 인식되도록 함
 */
export const HLS_CONFIG = {
  segmentTime: 6, // 세그먼트 길이 (초) - 4초보다 안정적
  listSize: 0, // 모든 세그먼트 유지 (VOD)
  segmentType: 'mpegts', // MPEG-TS (호환성 우수)
  flags: 'independent_segments+temp_file',
  playlistType: 'event', // VOD 플레이리스트 (라이브 스트림 아님)
  startNumber: 0,
} as const;

/**
 * 품질 프로파일 선택 및 생성 로직
 */
export class QualityProfileSelector {
  /**
   * 원본 해상도를 기반으로 최적의 단일 품질 프로파일 선택
   *
   * 전략:
   * - 원본 해상도보다 낮거나 같은 최대 품질 선택
   * - 업스케일링 방지
   * - 최소 360p 보장
   */
  static selectOptimal(mediaInfo: MediaInfo): QualityProfile {
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
  static createCustom(width: number, height: number): QualityProfile {
    // 픽셀 수 기반 비트레이트 계산 (대략적)
    const pixels = width * height;
    let videoBitrate: string;
    let audioBitrate: string;
    let maxrate: string;
    let bufsize: string;

    if (pixels >= 2073600) {
      // 1920x1080
      videoBitrate = '5M';
      audioBitrate = '128k';
      maxrate = '6M';
      bufsize = '12M';
    } else if (pixels >= 921600) {
      // 1280x720
      videoBitrate = '3M';
      audioBitrate = '128k';
      maxrate = '3.5M';
      bufsize = '6M';
    } else if (pixels >= 409920) {
      // 854x480
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
   * 원본 해상도에 적합한 모든 ABR 품질 프로파일 생성
   *
   * Lazy ABR 전략:
   * - 원본보다 높은 해상도는 제외 (업스케일링 방지)
   * - 최소 2개, 최대 4개 품질 제공
   * - 대역폭 범위를 최대한 커버
   *
   * @returns 사용 가능한 품질 프로파일 배열 (높은 품질 -> 낮은 품질 순서)
   */
  static generateABR(mediaInfo: MediaInfo): QualityProfile[] {
    const width = mediaInfo.width || 0;
    const height = mediaInfo.height || 0;

    // 원본 해상도가 없으면 720p, 480p 기본값
    if (!width || !height) {
      return [QUALITY_PROFILES['720p'], QUALITY_PROFILES['480p']];
    }

    const profiles: QualityProfile[] = [];

    // 원본 해상도 이하의 프로파일만 선택
    if (width >= 1920 && height >= 1080) {
      profiles.push(QUALITY_PROFILES['1080p']);
    }
    if (width >= 1280 && height >= 720) {
      profiles.push(QUALITY_PROFILES['720p']);
    }
    if (width >= 854 && height >= 480) {
      profiles.push(QUALITY_PROFILES['480p']);
    }
    // 항상 360p는 포함 (모바일/저속 네트워크 대응)
    profiles.push(QUALITY_PROFILES['360p']);

    // 최소 2개 품질 보장
    if (profiles.length < 2) {
      // 매우 낮은 해상도인 경우, 커스텀 프로파일 추가
      const customProfile = this.createCustom(width, height);
      profiles.unshift(customProfile);
      profiles.push(QUALITY_PROFILES['360p']);
    }

    return profiles;
  }

  /**
   * 기본(초기) 품질 선택
   *
   * Lazy ABR에서 처음에 트랜스코딩을 시작할 품질을 선택합니다.
   * 중간 품질을 선택하여 대부분의 네트워크 환경에 적합하도록 합니다.
   */
  static selectDefault(profiles: QualityProfile[]): QualityProfile {
    // 중간 품질 선택 (대부분의 경우 720p or 480p)
    const middleIndex = Math.floor(profiles.length / 2);
    return profiles[middleIndex];
  }

  /**
   * GOP (Group of Pictures) 크기 계산
   *
   * 세그먼트 시간과 정확히 일치하도록 GOP 크기를 계산합니다.
   */
  static getGOPSize(fps: number, segmentTime: number): number {
    return Math.round(fps * segmentTime);
  }

  /**
   * 키프레임 간격 표현식
   *
   * FFmpeg의 force_key_frames에 사용되며, 정확한 시간 간격으로 키프레임을 강제합니다.
   */
  static getKeyframeExpression(segmentTime: number): string {
    return `expr:gte(t,n_forced*${segmentTime})`;
  }
}

// 하위 호환성을 위한 함수 export
export const selectOptimalProfile = QualityProfileSelector.selectOptimal.bind(QualityProfileSelector);
export const createCustomProfile = QualityProfileSelector.createCustom.bind(QualityProfileSelector);
export const generateABRProfiles = QualityProfileSelector.generateABR.bind(QualityProfileSelector);
export const selectDefaultProfile = QualityProfileSelector.selectDefault.bind(QualityProfileSelector);
export const getGOPSize = QualityProfileSelector.getGOPSize.bind(QualityProfileSelector);
export const getKeyframeExpression = QualityProfileSelector.getKeyframeExpression.bind(QualityProfileSelector);
