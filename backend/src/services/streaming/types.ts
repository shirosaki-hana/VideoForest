import type { ChildProcess } from 'child_process';
//------------------------------------------------------------------------------//

/**
 * 트랜스코딩 방식
 */
export type TranscodeMethod = 'cpu' | 'nvenc' | 'qsv';

/**
 * 비디오 품질 프로파일
 */
export interface QualityProfile {
  name: string;           // 예: '1080p', '720p', '480p', '360p'
  width: number;          // 너비
  height: number;         // 높이
  videoBitrate: string;   // 비디오 비트레이트 (예: '5M')
  audioBitrate: string;   // 오디오 비트레이트 (예: '128k')
  maxrate: string;        // 최대 비트레이트
  bufsize: string;        // 버퍼 크기
}

/**
 * 인코더 옵션
 */
export interface EncoderOptions {
  method: TranscodeMethod;
  profile: QualityProfile;
}

/**
 * HLS 세션 정보
 */
export interface HLSSession {
  mediaId: string;
  process: ChildProcess;
  outputDir: string;
  lastAccess: number;
  masterPlaylist: string;
  qualityProfiles: QualityProfile[];
}

/**
 * FFmpeg 프로세스 결과
 */
export interface FFmpegProcessResult {
  process: ChildProcess;
  masterPlaylistPath: string;
  qualityProfiles: QualityProfile[];
}

/**
 * 미디어 정보
 */
export interface MediaInfo {
  width: number | null;
  height: number | null;
  duration: number | null;
}

