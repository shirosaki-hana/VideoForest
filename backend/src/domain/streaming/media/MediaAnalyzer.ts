import type { MediaInfo, MediaAnalysis } from '../types.js';
import { HLS_CONFIG, QualityProfileSelector } from './QualityProfiles.js';

/**
 * 미디어 분석 로직
 * 
 * 책임:
 * - 미디어 호환성 체크
 * - 트랜스코딩 전략 결정
 * - 세그먼트 계산
 */
export class MediaAnalyzer {
  /**
   * 미디어 분석 - 호환성 체크 및 트랜스코딩 전략 결정
   * 
   * 핵심 로직: 메타데이터를 기반으로 최적의 트랜스코딩 전략을 결정합니다.
   */
  static analyze(mediaInfo: MediaInfo): MediaAnalysis {
    const issues: string[] = [];

    // 1. 비디오 코덱 분석
    const videoCodec = mediaInfo.codec?.toLowerCase() || 'unknown';
    const needsVideoTranscode = !['h264', 'avc'].includes(videoCodec);

    if (!mediaInfo.codec) {
      issues.push('Unknown video codec');
    } else if (needsVideoTranscode) {
      issues.push(`Incompatible video codec: ${mediaInfo.codec} (will transcode to H.264)`);
    }

    // 2. 오디오 분석
    const audioCodec = mediaInfo.audioCodec?.toLowerCase();
    const hasAudio = !!audioCodec;
    const needsAudioTranscode = hasAudio && !['aac', 'mp3'].includes(audioCodec);

    if (!hasAudio) {
      issues.push('No audio stream (will generate silent audio)');
    } else if (needsAudioTranscode) {
      issues.push(`Incompatible audio codec: ${mediaInfo.audioCodec} (will transcode to AAC)`);
    }

    // 3. 해상도 분석
    if (!mediaInfo.width || !mediaInfo.height) {
      issues.push('Unknown resolution (will use default 720p)');
    }

    // 4. FPS 분석
    const fps = mediaInfo.fps || 24;
    if (!mediaInfo.fps) {
      issues.push('Unknown frame rate (will use default 24fps)');
    }

    // 5. HLS 세그먼트 시간 설정
    const segmentDuration = HLS_CONFIG.segmentTime;

    // 6. 전체 세그먼트 개수 계산
    const duration = mediaInfo.duration || 0;
    const totalSegments = duration > 0 ? Math.ceil(duration / segmentDuration) : 0;

    // 7. 직접 복사 가능 여부 (향후 최적화를 위해)
    const canDirectCopy =
      videoCodec === 'h264' && (!hasAudio || audioCodec === 'aac') && mediaInfo.width !== null && mediaInfo.height !== null;

    // 8. 품질 프로파일 선택
    const recommendedProfile = QualityProfileSelector.selectOptimal(mediaInfo);

    // 9. 입력 포맷 정보
    const inputFormat = {
      videoCodec: mediaInfo.codec || 'unknown',
      audioCodec: mediaInfo.audioCodec || null,
      width: mediaInfo.width || 1280,
      height: mediaInfo.height || 720,
      fps,
    };

    const analysis: MediaAnalysis = {
      canDirectCopy,
      needsVideoTranscode,
      needsAudioTranscode,
      hasAudio,
      compatibilityIssues: issues,
      recommendedProfile,
      segmentDuration,
      totalSegments,
      inputFormat,
    };

    return analysis;
  }

  /**
   * 분석 결과의 요약 정보 생성
   */
  static getSummary(analysis: MediaAnalysis): {
    isCompatible: boolean;
    requiresTranscoding: boolean;
    issueCount: number;
    segmentInfo: string;
  } {
    return {
      isCompatible: analysis.compatibilityIssues.length === 0,
      requiresTranscoding: analysis.needsVideoTranscode || analysis.needsAudioTranscode,
      issueCount: analysis.compatibilityIssues.length,
      segmentInfo: `${analysis.totalSegments} segments × ${analysis.segmentDuration}s`,
    };
  }
}

// 하위 호환성을 위한 함수 export
export const analyzeMedia = MediaAnalyzer.analyze.bind(MediaAnalyzer);

