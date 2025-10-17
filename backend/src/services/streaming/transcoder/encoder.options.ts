import type { TranscodeMethod, QualityProfile } from '../types.js';
import { getGOPSize } from './ffmpeg.config.js';
//------------------------------------------------------------------------------//

/**
 * CPU (libx264) 인코더 옵션
 */
function getCPUEncoderArgs(profile: QualityProfile): string[] {
  return [
    '-c:v', 'libx264',
    '-preset', 'veryfast',           // 빠른 인코딩
    '-crf', '23',                    // 품질 (VBR)
    '-maxrate', profile.maxrate,     // 최대 비트레이트
    '-bufsize', profile.bufsize,     // 버퍼 크기
    '-profile:v', 'high',            // H.264 프로파일
    '-level', '4.1',                 // H.264 레벨
    '-pix_fmt', 'yuv420p',           // 픽셀 포맷
    '-sc_threshold', '0',            // 장면 전환 감지 비활성화
    '-g', getGOPSize().toString(),   // GOP 크기
    '-keyint_min', getGOPSize().toString(),
    '-force_key_frames', 'expr:gte(t,n_forced*4)', // 4초마다 키프레임
  ];
}

/**
 * NVIDIA NVENC 인코더 옵션
 */
function getNVENCEncoderArgs(profile: QualityProfile): string[] {
  return [
    '-c:v', 'h264_nvenc',
    '-preset', 'hq',                 // 고품질 프리셋
    '-rc', 'vbr',                    // 가변 비트레이트
    '-cq', '23',                     // 품질
    '-b:v', profile.videoBitrate,    // 목표 비트레이트
    '-maxrate', profile.maxrate,     // 최대 비트레이트
    '-bufsize', profile.bufsize,     // 버퍼 크기
    '-profile:v', 'high',
    '-level', '4.1',
    '-pix_fmt', 'yuv420p',
    '-g', getGOPSize().toString(),
    '-bf', '2',                      // B 프레임 2개
    '-refs', '3',                    // 참조 프레임 3개
  ];
}

/**
 * Intel QSV 인코더 옵션
 */
function getQSVEncoderArgs(profile: QualityProfile): string[] {
  return [
    '-c:v', 'h264_qsv',
    '-preset', 'medium',
    '-global_quality', '23',
    '-b:v', profile.videoBitrate,
    '-maxrate', profile.maxrate,
    '-bufsize', profile.bufsize,
    '-look_ahead', '1',
    '-profile:v', 'high',
    '-level', '4.1',
    '-pix_fmt', 'nv12',              // QSV 최적화 포맷
    '-g', getGOPSize().toString(),
    '-keyint_min', getGOPSize().toString(),
  ];
}

/**
 * 트랜스코딩 방식에 따른 비디오 인코더 옵션 생성
 */
export function getVideoEncoderArgs(method: TranscodeMethod, profile: QualityProfile): string[] {
  switch (method) {
    case 'cpu':
      return getCPUEncoderArgs(profile);
    case 'nvenc':
      return getNVENCEncoderArgs(profile);
    case 'qsv':
      return getQSVEncoderArgs(profile);
    default:
      throw new Error(`Unknown transcode method: ${method}`);
  }
}

/**
 * 오디오 인코더 옵션 (모든 방식 공통)
 */
export function getAudioEncoderArgs(profile: QualityProfile): string[] {
  return [
    '-c:a', 'aac',
    '-b:a', profile.audioBitrate,
    '-ar', '48000',   // 48kHz 샘플레이트
    '-ac', '2',       // 스테레오
  ];
}

/**
 * 비디오 필터 (스케일링)
 */
export function getVideoFilterArgs(profile: QualityProfile): string[] {
  return [
    '-vf', `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2`,
  ];
}

