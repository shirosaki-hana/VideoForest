import type { QualityProfile, MediaAnalysis } from '../types.js';
import { QualityProfileSelector } from '../media/QualityProfiles.js';
//------------------------------------------------------------------------------//

/**
 * 지원하는 비디오 인코더 타입
 */
export type VideoEncoderType = 'h264_nvenc' | 'h264_qsv' | 'libx264';

/**
 * FFmpeg 인코더 옵션 생성 로직
 *
 * 책임:
 * - 비디오/오디오 인코더 옵션 생성 (순수 로직)
 * - 프로파일 기반 최적화 전략 결정
 * - GOP 크기, 키프레임 설정 계산
 * - GPU/CPU 인코더 옵션 관리
 *
 * Note: FFmpeg 실행은 infrastructure 레이어에서 담당
 */
export class EncoderOptions {
  /**
   * 메타데이터 기반 동적 비디오 인코더 옵션 빌더
   */
  static buildVideoArgs(
    profile: QualityProfile,
    analysis: MediaAnalysis,
    speedMode: boolean = false,
    encoderType: VideoEncoderType = 'libx264'
  ): string[] {
    const fps = analysis.inputFormat.fps || 24;
    const segmentDuration = analysis.segmentDuration;
    const gopSize = QualityProfileSelector.getGOPSize(fps, segmentDuration);
    const keyframeExpr = QualityProfileSelector.getKeyframeExpression(segmentDuration);

    // 인코더 타입에 따라 적절한 옵션 생성
    if (encoderType === 'h264_nvenc') {
      return this.buildNVENCVideoArgs(profile, gopSize, keyframeExpr, speedMode);
    } else if (encoderType === 'h264_qsv') {
      return this.buildQSVVideoArgs(profile, gopSize, keyframeExpr, speedMode);
    } else {
      return this.buildCPUVideoArgs(profile, gopSize, keyframeExpr, speedMode);
    }
  }

  /**
   * NVENC (NVIDIA GPU) 인코더 옵션
   *
   * GPU 가속 인코딩 설정:
   * - preset: 구형 FFmpeg와 호환되는 프리셋 사용
   *   - llhq (Low Latency High Quality): 스트리밍 최적화, 품질 우선
   *   - llhp (Low Latency High Performance): 스트리밍 최적화, 속도 우선
   * - rc vbr: Variable Bitrate (품질 우선)
   * - 하드웨어 가속으로 CPU 대비 3~10배 빠름
   */
  private static buildNVENCVideoArgs(profile: QualityProfile, gopSize: number, keyframeExpr: string, speedMode: boolean): string[] {
    if (speedMode) {
      // 속도 최우선 모드: AQ와 Lookahead 비활성화로 극한의 속도
      return [
        '-c:v',
        'h264_nvenc',
        '-preset',
        'llhp', // Low Latency High Performance (최고 속도)
        '-rc',
        'cbr', // CBR 모드가 VBR보다 계산이 단순함
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
        '-force_key_frames',
        keyframeExpr,
        '-profile:v',
        'baseline', // baseline 프로파일로 단순화
        '-level',
        '4.0',
        '-pix_fmt',
        'yuv420p',
        // 속도를 위해 품질 향상 기능 모두 비활성화
        '-spatial-aq',
        '0', // Spatial AQ 끄기
        '-temporal-aq',
        '0', // Temporal AQ 끄기
        '-rc-lookahead',
        '0', // Lookahead 끄기 (속도 향상)
        '-no-scenecut',
        '1', // Scene cut 감지 비활성화
        '-zerolatency',
        '1', // Zero latency 모드
        '-2pass',
        '0', // 2pass 비활성화
      ];
    }

    // 기본 모드 (균형)
    return [
      '-c:v',
      'h264_nvenc',
      '-preset',
      'llhq', // Low Latency High Quality
      '-rc',
      'vbr', // Variable Bitrate
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
      '-force_key_frames',
      keyframeExpr,
      '-profile:v',
      'main',
      '-level',
      '4.0',
      '-pix_fmt',
      'yuv420p',
      // NVENC 특화 옵션 (구형 FFmpeg 호환)
      '-spatial-aq',
      '1', // Spatial Adaptive Quantization (품질 향상)
      '-temporal-aq',
      '1', // Temporal AQ (시간적 품질 향상)
      '-rc-lookahead',
      '10', // Rate Control Lookahead 줄임 (20 -> 10)
    ];
  }

  /**
   * QSV (Intel Quick Sync Video) 인코더 옵션
   *
   * Intel GPU 가속 인코딩 설정:
   * - preset: veryfast (스트리밍 최적화)
   * - global_quality: 품질 설정 (낮을수록 고품질)
   * - look_ahead: Rate Control Lookahead
   * - 하드웨어 가속으로 CPU 대비 2~5배 빠름
   */
  private static buildQSVVideoArgs(profile: QualityProfile, gopSize: number, keyframeExpr: string, speedMode: boolean): string[] {
    if (speedMode) {
      // 속도 최우선 모드: 품질 희생하고 속도 극대화
      return [
        '-c:v',
        'h264_qsv',
        '-preset',
        'veryfast', // QSV에서 가장 빠른 프리셋
        '-global_quality',
        '28', // 품질 낮춤 (속도 우선)
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
        '-force_key_frames',
        keyframeExpr,
        '-profile:v',
        'baseline', // baseline 프로파일로 단순화
        '-level',
        '4.0',
        '-pix_fmt',
        'nv12',
        '-look_ahead',
        '0', // Lookahead 비활성화 (속도 향상)
        '-async_depth',
        '4', // 비동기 처리 깊이 (병렬 처리 향상)
        '-low_power',
        '0', // 저전력 모드 끄기 (성능 우선)
      ];
    }

    // 기본 모드 (균형)
    return [
      '-c:v',
      'h264_qsv',
      '-preset',
      'veryfast',
      '-global_quality',
      '23', // 품질 (18-28 범위, 낮을수록 고품질)
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
      '-force_key_frames',
      keyframeExpr,
      '-profile:v',
      'main',
      '-level',
      '4.0',
      '-pix_fmt',
      'nv12', // QSV는 nv12 픽셀 포맷 선호
      '-look_ahead',
      '1', // Lookahead 활성화
      '-look_ahead_depth',
      '20', // Lookahead 깊이 줄임 (40 -> 20)
      '-async_depth',
      '2', // 비동기 처리
    ];
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
  static buildVideoFilter(profile: QualityProfile, analysis: MediaAnalysis, speedMode: boolean = false): string {
    const { width: targetWidth, height: targetHeight } = profile;
    const { width: srcWidth, height: srcHeight } = analysis.inputFormat;

    // 원본과 타겟이 같으면 스케일링 불필요
    if (srcWidth === targetWidth && srcHeight === targetHeight) {
      return 'null';
    }

    // 스케일링 필터
    // speedMode: fast_bilinear (초고속, 품질 낮음)
    // 기본: lanczos (고품질, 느림)
    const scaleAlgo = speedMode ? 'fast_bilinear' : 'lanczos';
    return `scale=${targetWidth}:${targetHeight}:flags=${scaleAlgo}`;
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
      args.push('-analyzeduration', '100000'); // 더 공격적으로 줄임
      args.push('-probesize', '5000000'); // 5MB로 제한
      args.push('-fflags', '+discardcorrupt+nobuffer'); // 버퍼링 최소화
      args.push('-flags', 'low_delay'); // 저지연 플래그
      args.push('-strict', 'experimental'); // 실험적 기능 활성화
    }

    return args;
  }
}
