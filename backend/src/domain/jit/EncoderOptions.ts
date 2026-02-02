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
   * NVIDIA GPU 가속 인코딩 설정:
   * - 최대한 간소화하여 호환성 확보
   * - 하드웨어 가속으로 CPU 대비 3~10배 빠름
   */
  private static buildNVENCVideoArgs(profile: QualityProfile, gopSize: number, keyframeExpr: string, speedMode: boolean): string[] {
    // NVENC도 드라이버/GPU 세대마다 지원 옵션이 다를 수 있음
    // spatial-aq, temporal-aq, rc-lookahead 등은 호환성 문제 가능
    return [
      '-c:v',
      'h264_nvenc',
      '-preset',
      speedMode ? 'p1' : 'p4', // p1(fastest) ~ p7(slowest), 신규 FFmpeg 프리셋
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
    ];
  }

  /**
   * QSV (Intel Quick Sync Video) 인코더 옵션
   *
   * Intel GPU 가속 인코딩 설정:
   * - 최대한 간소화하여 호환성 확보 (하드웨어마다 지원 범위가 다름)
   * - 하드웨어 가속으로 CPU 대비 2~5배 빠름
   */
  private static buildQSVVideoArgs(profile: QualityProfile, gopSize: number, keyframeExpr: string, speedMode: boolean): string[] {
    // QSV는 하드웨어마다 지원 옵션이 달라서 최소한의 옵션만 사용
    // global_quality, look_ahead, async_depth 등은 호환성 문제 발생 가능
    return [
      '-c:v',
      'h264_qsv',
      '-preset',
      speedMode ? 'veryfast' : 'fast',
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
    ];
  }

  /**
   * CPU (libx264) 인코더 옵션
   *
   * 소프트웨어 인코딩 설정:
   * - 간소화된 옵션으로 안정성 확보
   * - preset으로 속도/품질 조절
   */
  private static buildCPUVideoArgs(profile: QualityProfile, gopSize: number, keyframeExpr: string, speedMode: boolean): string[] {
    // libx264는 안정적이지만 불필요한 옵션은 제거
    // tune, profile, level, pix_fmt 등은 FFmpeg가 자동 결정
    return [
      '-c:v',
      'libx264',
      '-preset',
      speedMode ? 'ultrafast' : 'veryfast',
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
    ];
  }

  /**
   * 오디오 인코더 옵션
   *
   * 팝 노이즈 방지를 위한 처리:
   * - 극히 짧은 페이드 인/아웃으로 DC offset 및 급격한 waveform 전환 완화
   * - aresample 필터로 오디오 동기화 및 PTS 정렬
   *
   * 페이드 시간 선택 근거 (청각 심리학):
   * - 2-3ms: 팝/클릭 방지에 충분, 인지 거의 불가능
   * - 5-10ms: 안전한 범위, 일반적인 크로스페이드 표준
   * - 10ms+: 예민한 청자가 "펌핑" 느낌을 받을 수 있음
   *
   * 2.5ms를 선택한 이유:
   * - DC offset 제거에 충분 (약 120 샘플 @ 48kHz)
   * - 인간 청각의 temporal masking 범위 내
   * - 6초마다 반복되어도 감지 불가능한 수준
   */
  static buildAudioArgs(profile: QualityProfile, _analysis: MediaAnalysis, segmentDuration?: number): string[] {
    const baseArgs = ['-c:a', 'aac', '-b:a', profile.audioBitrate, '-ar', '48000', '-ac', '2'];

    // 오디오 필터 체인 구성
    // - aresample: 오디오 리샘플링 및 PTS 정렬 (async=1로 드리프트 보정)
    // - afade: 극히 짧은 페이드로 팝 노이즈 방지 (청각적으로 인지 불가)
    const fadeSec = 0.0025; // 2.5ms - 팝 방지에 충분하면서 인지 불가능

    if (segmentDuration && segmentDuration > fadeSec * 2) {
      const fadeOutStart = Math.max(0, segmentDuration - fadeSec);
      const audioFilter = `aresample=async=1:first_pts=0,afade=t=in:st=0:d=${fadeSec},afade=t=out:st=${fadeOutStart.toFixed(5)}:d=${fadeSec}`;
      return [...baseArgs, '-af', audioFilter];
    }

    // segmentDuration이 없거나 너무 짧은 경우 기본 리샘플링만 적용
    return [...baseArgs, '-af', 'aresample=async=1:first_pts=0'];
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
   * 전역 FFmpeg 플래그
   */
  static getGlobalArgs(): string[] {
    return ['-y', '-nostats', '-hide_banner', '-loglevel', 'error'];
  }
}
