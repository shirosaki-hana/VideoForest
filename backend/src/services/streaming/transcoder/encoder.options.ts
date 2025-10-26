import type { QualityProfile, MediaAnalysis } from '../types.js';
import { getGOPSize, getKeyframeExpression } from './ffmpeg.config.js';
import { env } from '../../../config/index.js';
//------------------------------------------------------------------------------//

/**
 * 메타데이터 기반 동적 비디오 인코더 옵션 빌더
 *
 * 원본 비디오 정보를 분석하여 최적의 FFmpeg 옵션을 생성합니다.
 * CPU 트랜스코딩만 지원합니다.
 */
export function buildVideoEncoderArgs(profile: QualityProfile, analysis: MediaAnalysis): string[] {
  const fps = analysis.inputFormat.fps || 24;
  const segmentDuration = analysis.segmentDuration;
  const gopSize = getGOPSize(fps, segmentDuration);
  const keyframeExpr = getKeyframeExpression(segmentDuration);

  return buildCPUVideoArgs(profile, gopSize, keyframeExpr);
}

/**
 * CPU (libx264) 인코더 옵션
 *
 * JIT 스트리밍에 최적화된 고속 인코딩 설정:
 * - veryfast preset: 속도 우선 (medium 대비 ~5-10배 빠름)
 * - threads 0: 모든 CPU 코어 활용
 * - tune zerolatency: 스트리밍 지연 최소화
 * - 단순 비트레이트 모드: CRF 제거로 예측 가능한 성능
 */
function buildCPUVideoArgs(profile: QualityProfile, gopSize: number, keyframeExpr: string): string[] {
  const SPEED_MODE = env.VIDEOFOREST_SPEED_MODE;

  if (SPEED_MODE) {
    return [
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-tune',
      'zerolatency,fastdecode',
      '-threads',
      '0',
      '-bf',
      '0',
      '-b:v',
      profile.videoBitrate,
      '-maxrate',
      profile.maxrate,
      '-bufsize',
      profile.bufsize,
      '-profile:v',
      'high',
      '-level',
      '4.1',
      '-pix_fmt',
      'yuv420p',
      '-sc_threshold',
      '0',
      '-g',
      gopSize.toString(),
      '-keyint_min',
      gopSize.toString(),
      '-force_key_frames',
      keyframeExpr,
      '-x264-params',
      'sliced-threads=1:sync-lookahead=0:b-adapt=0:ref=1:rc-lookahead=0',
    ];
  }

  return [
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-tune',
    'zerolatency',
    '-threads',
    '0',
    '-b:v',
    profile.videoBitrate,
    '-maxrate',
    profile.maxrate,
    '-bufsize',
    profile.bufsize,
    '-profile:v',
    'high',
    '-level',
    '4.1',
    '-pix_fmt',
    'yuv420p',
    '-sc_threshold',
    '0',
    '-g',
    gopSize.toString(),
    '-keyint_min',
    gopSize.toString(),
    '-force_key_frames',
    keyframeExpr,
    '-x264-params',
    'sliced-threads=1:sync-lookahead=0',
  ];
}

/**
 * 오디오 인코더 옵션 빌더
 *
 * 원본 오디오 정보를 기반으로 최적의 옵션 선택
 */
export function buildAudioEncoderArgs(profile: QualityProfile, analysis: MediaAnalysis): string[] {
  const SPEED_MODE = env.VIDEOFOREST_SPEED_MODE;
  if (!analysis.hasAudio) {
    if (SPEED_MODE) {
      return ['-c:a', 'aac', '-b:a', '64k', '-ar', '44100', '-ac', '1'];
    }
    return ['-c:a', 'aac', '-b:a', '64k', '-ar', '48000', '-ac', '2'];
  }

  // AAC이고 트랜스코딩 불필요하면 복사
  if (!analysis.needsAudioTranscode && analysis.inputFormat.audioCodec === 'aac') {
    return ['-c:a', 'copy'];
  }

  // 일반적인 AAC 트랜스코딩
  if (SPEED_MODE) {
    return ['-c:a', 'aac', '-b:a', '64k', '-ar', '44100', '-ac', '1'];
  }

  return ['-c:a', 'aac', '-b:a', profile.audioBitrate, '-ar', '48000', '-ac', '2'];
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
