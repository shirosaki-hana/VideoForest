import type { QualityProfile, MediaAnalysis } from '../types.js';
import { getGOPSize, getKeyframeExpression } from './ffmpeg.config.js';
//------------------------------------------------------------------------------//

/**
 * 메타데이터 기반 동적 비디오 인코더 옵션 빌더
 *
 * 원본 비디오 정보를 분석하여 최적의 FFmpeg 옵션을 생성합니다.
 * CPU 트랜스코딩만 지원합니다.
 */
export function buildVideoEncoderArgs(profile: QualityProfile, analysis: MediaAnalysis): string[] {
  const fps = analysis.inputFormat.fps || 24;
  const segmentTime = analysis.segmentTime;
  const gopSize = getGOPSize(fps, segmentTime);
  const keyframeExpr = getKeyframeExpression(segmentTime);

  return buildCPUVideoArgs(profile, gopSize, keyframeExpr);
}

/**
 * CPU (libx264) 인코더 옵션
 *
 * 가장 호환성이 좋고 안정적인 옵션
 */
function buildCPUVideoArgs(profile: QualityProfile, gopSize: number, keyframeExpr: string): string[] {
  return [
    '-c:v',
    'libx264',
    '-preset',
    'medium', // 속도와 품질 균형
    '-crf',
    '23', // 일정 품질 (낮을수록 고품질)
    '-maxrate',
    profile.maxrate, // 최대 비트레이트 제한
    '-bufsize',
    profile.bufsize, // 버퍼 크기
    '-profile:v',
    'high', // H.264 프로파일
    '-level',
    '4.1', // 대부분 기기 호환
    '-pix_fmt',
    'yuv420p', // 범용 픽셀 포맷
    '-movflags',
    '+faststart', // 빠른 시작
    '-sc_threshold',
    '0', // 장면 전환 감지 비활성화
    '-g',
    gopSize.toString(), // GOP 크기
    '-keyint_min',
    gopSize.toString(),
    '-force_key_frames',
    keyframeExpr,
  ];
}

/**
 * 오디오 인코더 옵션 빌더
 *
 * 원본 오디오 정보를 기반으로 최적의 옵션 선택
 */
export function buildAudioEncoderArgs(profile: QualityProfile, analysis: MediaAnalysis): string[] {
  if (!analysis.hasAudio) {
    // 오디오 없음 - 무음 오디오 인코더 설정만 (입력은 buildFFmpegArgs에서 처리)
    return ['-c:a', 'aac', '-b:a', '64k', '-ar', '48000', '-ac', '2'];
  }

  // AAC이고 트랜스코딩 불필요하면 복사
  if (!analysis.needsAudioTranscode && analysis.inputFormat.audioCodec === 'aac') {
    return ['-c:a', 'copy'];
  }

  // 일반적인 AAC 트랜스코딩
  return [
    '-c:a',
    'aac',
    '-b:a',
    profile.audioBitrate,
    '-ar',
    '48000', // 48kHz 샘플레이트
    '-ac',
    '2', // 스테레오
  ];
}

/**
 * 비디오 필터 빌더
 *
 * 스케일링 및 패딩 옵션
 */
export function buildVideoFilter(profile: QualityProfile, analysis: MediaAnalysis): string {
  const originalWidth = analysis.inputFormat.width;
  const originalHeight = analysis.inputFormat.height;

  // 원본과 목표 해상도가 같으면 필터 불필요
  if (originalWidth === profile.width && originalHeight === profile.height) {
    return 'null'; // 패스스루
  }

  // 스케일링 + 레터박스 (검은 테두리)
  return (
    `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,` +
    `pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2:color=black`
  );
}

/**
 * 에러 복원 옵션
 *
 * 손상된 미디어 파일에 대한 관대한 옵션
 */
export function getErrorResilienceArgs(): string[] {
  return [
    '-fflags',
    '+genpts+discardcorrupt+igndts', // 타임스탬프 생성, 손상 프레임 무시
    '-err_detect',
    'ignore_err', // 에러 무시
    '-strict',
    '-2', // 실험적 코덱 허용
    '-max_error_rate',
    '1.0', // 모든 에러 허용
  ];
}

/**
 * 입력 옵션
 *
 * 안정적인 디코딩을 위한 옵션
 */
export function getInputArgs(): string[] {
  return [
    '-analyzeduration',
    '100M', // 분석 시간 증가
    '-probesize',
    '100M', // 프로브 크기 증가
  ];
}
