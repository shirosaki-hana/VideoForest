//------------------------------------------------------------------------------//
// JIT 트랜스코딩 + 영구 캐싱 아키텍처
//
// 핵심 개념:
// 1. 미디어 duration 기반으로 구라 플레이리스트 사전 생성
// 2. 세그먼트 요청 시: 캐시 확인 → 없으면 JIT 트랜스코딩
// 3. 트랜스코딩된 세그먼트는 영구 보관 (사용자가 수동 정리)
// 4. Back-seek, 화질 전환 자동 지원
//------------------------------------------------------------------------------//

/**
 * 비디오 품질 프로파일
 */
export interface QualityProfile {
  name: string; // 예: '720p'
  width: number; // 너비
  height: number; // 높이
  videoBitrate: string; // 비디오 비트레이트 (예: '3M')
  audioBitrate: string; // 오디오 비트레이트 (예: '128k')
  maxrate: string; // 최대 비트레이트
  bufsize: string; // 버퍼 크기
}

/**
 * 미디어 정보 (DB에서 가져온 메타데이터)
 */
export interface MediaInfo {
  width: number | null;
  height: number | null;
  duration: number | null; // 초 단위 (JIT 트랜스코딩의 핵심)
  codec: string | null;
  audioCodec: string | null;
  fps: number | null;
  bitrate: number | null;
}

/**
 * 미디어 분석 결과
 */
export interface MediaAnalysis {
  canDirectCopy: boolean;
  needsVideoTranscode: boolean;
  needsAudioTranscode: boolean;
  hasAudio: boolean;
  compatibilityIssues: string[];
  recommendedProfile: QualityProfile;
  segmentDuration: number; // HLS 세그먼트 길이 (초)
  totalSegments: number; // 전체 세그먼트 개수
  inputFormat: {
    videoCodec: string;
    audioCodec: string | null;
    width: number;
    height: number;
    fps: number;
  };
}

/**
 * 세그먼트 정보 (기본 - 근사값)
 */
export interface SegmentInfo {
  segmentNumber: number; // 세그먼트 번호 (0부터 시작)
  startTime: number; // 시작 시간 (초)
  duration: number; // 세그먼트 길이 (초)
  fileName: string; // segment_000.ts
}

/**
 * 정확한 세그먼트 정보 (키프레임 기반)
 * 
 * keyframe.analyzer와 segment.calculator에서 사용
 */
export interface AccurateSegmentInfo {
  segmentNumber: number;
  startTime: number; // 정확한 시작 (키프레임 PTS)
  endTime: number; // 정확한 종료 (다음 키프레임 PTS)
  duration: number; // 실제 duration
  startKeyframeIndex: number;
  endKeyframeIndex: number;
  fileName: string;
}

/**
 * 키프레임 정보
 */
export interface KeyframeInfo {
  index: number;
  pts: number; // 타임스탬프 (초)
  frameNumber: number;
}

/**
 * 키프레임 분석 결과
 */
export interface KeyframeAnalysis {
  keyframes: KeyframeInfo[];
  averageGopSize: number;
  averageGopDuration: number;
  totalKeyframes: number;
  totalDuration: number;
  fps: number;
}

/**
 * 미디어 메타데이터 (플레이리스트 생성용)
 */
export interface MediaMetadata {
  mediaId: string;
  mediaPath: string; // 원본 파일 경로
  duration: number; // 전체 재생 시간 (초)
  segmentDuration: number; // 세그먼트 길이 (초, 목표값)
  totalSegments: number; // 전체 세그먼트 개수
  availableProfiles: QualityProfile[]; // 지원 화질 목록
  analysis: MediaAnalysis;
  
  // 키프레임 기반 정확한 세그먼트 (옵션)
  keyframeAnalysis?: KeyframeAnalysis;
  accurateSegments?: AccurateSegmentInfo[];
}

/**
 * JIT 트랜스코딩 진행 중 추적
 * (동시 요청 방지용 - 같은 세그먼트를 여러 클라이언트가 요청할 수 있음)
 */
export interface TranscodingJob {
  mediaId: string;
  quality: string;
  segmentNumber: number;
  promise: Promise<string | null>; // 세그먼트 파일 경로 반환 (실패 시 null)
  startTime: number;
}
