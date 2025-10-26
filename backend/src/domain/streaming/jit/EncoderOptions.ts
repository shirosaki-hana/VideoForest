import type { QualityProfile, MediaAnalysis } from '../types.js';
import { QualityProfileSelector } from '../media/QualityProfiles.js';

/**
 * FFmpeg 인코더 옵션 생성 로직
 *
 * 책임:
 * - 비디오/오디오 인코더 옵션 생성 (순수 로직)
 * - 프로파일 기반 최적화 전략 결정
 * - GOP 크기, 키프레임 설정 계산
 *
 * Note: FFmpeg 실행은 infrastructure 레이어에서 담당
 */
export class EncoderOptions {
  /**
   * 메타데이터 기반 동적 비디오 인코더 옵션 빌더
   */
  static buildVideoArgs(profile: QualityProfile, analysis: MediaAnalysis, speedMode: boolean = false): string[] {
    const fps = analysis.inputFormat.fps || 24;
    const segmentDuration = analysis.segmentDuration;
    const gopSize = QualityProfileSelector.getGOPSize(fps, segmentDuration);
    const keyframeExpr = QualityProfileSelector.getKeyframeExpression(segmentDuration);

    return this.buildCPUVideoArgs(profile, gopSize, keyframeExpr, speedMode);
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
  private static buildCPUVideoArgs(profile: QualityProfile, gopSize: number, keyframeExpr: string, speedMode: boolean): string[] {
    if (speedMode) {
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
        '-g',
        String(gopSize),
        '-keyint_min',
        String(gopSize),
        '-sc_threshold',
        '0',
        '-force_key_frames',
        keyframeExpr,
        '-profile:v',
        'baseline',
        '-level',
        '3.0',
        '-pix_fmt',
        'yuv420p',
      ];
    }

    // 기본 모드 (균형)
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
      '-g',
      String(gopSize),
      '-keyint_min',
      String(gopSize),
      '-sc_threshold',
      '0',
      '-force_key_frames',
      keyframeExpr,
      '-profile:v',
      'main',
      '-level',
      '4.0',
      '-pix_fmt',
      'yuv420p',
    ];
  }

  /**
   * 오디오 인코더 옵션
   */
  static buildAudioArgs(profile: QualityProfile, _analysis: MediaAnalysis): string[] {
    return ['-c:a', 'aac', '-b:a', profile.audioBitrate, '-ar', '48000', '-ac', '2'];
  }

  /**
   * 비디오 필터 생성 (스케일링)
   */
  static buildVideoFilter(profile: QualityProfile, analysis: MediaAnalysis): string {
    const { width: targetWidth, height: targetHeight } = profile;
    const { width: srcWidth, height: srcHeight } = analysis.inputFormat;

    // 원본과 타겟이 같으면 스케일링 불필요
    if (srcWidth === targetWidth && srcHeight === targetHeight) {
      return 'null';
    }

    // 스케일링 필터
    // flags=lanczos: 고품질 다운스케일
    return `scale=${targetWidth}:${targetHeight}:flags=lanczos`;
  }

  /**
   * 에러 복원 옵션 (손상된 파일 대응)
   */
  static getErrorResilienceArgs(): string[] {
    return ['-err_detect', 'ignore_err', '-fflags', '+genpts+igndts'];
  }

  /**
   * 전역 FFmpeg 플래그 (로그, 성능 최적화)
   */
  static getGlobalArgs(speedMode: boolean = false): string[] {
    const args = ['-y', '-nostats', '-hide_banner', '-loglevel', 'error'];

    if (speedMode) {
      // 표준 컨테이너/코덱 가정 하에 스타트업 오버헤드 감소
      args.push('-analyzeduration', '0');
      args.push('-probesize', '32k');
    }

    return args;
  }
}

// 하위 호환성을 위한 함수 export
export const buildVideoEncoderArgs = (profile: QualityProfile, analysis: MediaAnalysis, speedMode?: boolean) =>
  EncoderOptions.buildVideoArgs(profile, analysis, speedMode);

export const buildAudioEncoderArgs = (profile: QualityProfile, analysis: MediaAnalysis) => EncoderOptions.buildAudioArgs(profile, analysis);

export const buildVideoFilter = (profile: QualityProfile, analysis: MediaAnalysis) => EncoderOptions.buildVideoFilter(profile, analysis);

export const getErrorResilienceArgs = () => EncoderOptions.getErrorResilienceArgs();
