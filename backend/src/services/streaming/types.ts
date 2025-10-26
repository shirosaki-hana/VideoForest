import type { ChildProcess } from 'child_process';
//------------------------------------------------------------------------------//

/**
 * 트랜스코딩 방식 (CPU만 지원)
 */
export type TranscodeMethod = 'cpu';

/**
 * 비디오 품질 프로파일 (단일 품질)
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
  duration: number | null;
  codec: string | null;
  audioCodec: string | null;
  fps: number | null;
  bitrate: number | null;
}

/**
 * 미디어 분석 결과
 */
export interface MediaAnalysis {
  canDirectCopy: boolean; // 트랜스코딩 없이 복사 가능한지
  needsVideoTranscode: boolean; // 비디오 트랜스코딩 필요 여부
  needsAudioTranscode: boolean; // 오디오 트랜스코딩 필요 여부
  hasAudio: boolean; // 오디오 스트림 존재 여부
  compatibilityIssues: string[]; // 호환성 문제 목록
  recommendedProfile: QualityProfile; // 추천 품질 프로파일
  segmentTime: number; // HLS 세그먼트 길이 (초) - FPS와 인코더 제약 기반
  inputFormat: {
    videoCodec: string;
    audioCodec: string | null;
    width: number;
    height: number;
    fps: number;
  };
}

/**
 * FFmpeg 프로세스 결과
 */
export interface FFmpegProcessResult {
  process: ChildProcess;
  playlistPath: string;
  profile: QualityProfile;
}

/**
 * 단일 품질 variant 세션
 */
export interface VariantSession {
  profile: QualityProfile;
  process: ChildProcess;
  outputDir: string;
  playlistPath: string;
  isReady: boolean; // 첫 세그먼트 생성 완료 여부
  segmentCount: number; // 생성된 세그먼트 수
  lastSegmentTime: number; // 마지막 세그먼트 생성 시간
}

/**
 * HLS 다중 품질 ABR 세션
 */
export interface HLSSession {
  mediaId: string;
  outputDir: string; // 루트 출력 디렉터리
  lastAccess: number;
  analysis: MediaAnalysis;
  variants: Map<string, VariantSession>; // 품질 이름 -> variant 세션
  masterPlaylistPath: string; // master.m3u8 경로
  availableProfiles: QualityProfile[]; // 사용 가능한 모든 품질 프로파일
}

/**
 * 트랜스코딩 실패 정보
 */
export interface TranscodingFailure {
  mediaId: string;
  error: string;
  ffmpegCommand?: string;
  ffmpegOutput?: string;
  timestamp: number;
  attemptCount: number;
  analysis?: MediaAnalysis;
}
