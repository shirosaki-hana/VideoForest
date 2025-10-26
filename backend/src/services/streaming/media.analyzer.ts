import { database } from '../../database/index.js';
import { logger } from '../../utils/index.js';
import { selectOptimalProfile, HLS_CONFIG } from './transcoder/index.js';
import type { MediaInfo, MediaAnalysis } from './types.js';

/**
 * 미디어 정보 조회 (DB에서)
 */
export async function getMediaInfo(mediaId: string): Promise<{ path: string; info: MediaInfo } | null> {
  const media = await database.media.findUnique({
    where: { id: mediaId },
  });

  if (!media || !media.filePath) {
    return null;
  }

  return {
    path: media.filePath,
    info: {
      width: media.width,
      height: media.height,
      duration: media.duration,
      codec: media.codec,
      audioCodec: media.audioCodec,
      fps: media.fps,
      bitrate: media.bitrate !== null ? Number(media.bitrate) : null,
    },
  };
}

/**
 * 미디어 분석 - 호환성 체크 및 트랜스코딩 전략 결정
 *
 * 핵심 로직: 메타데이터를 기반으로 최적의 트랜스코딩 전략을 결정합니다.
 */
export function analyzeMedia(mediaInfo: MediaInfo): MediaAnalysis {
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
  const recommendedProfile = selectOptimalProfile(mediaInfo);

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
    segmentDuration, // 계산된 최적 세그먼트 시간
    totalSegments, // 전체 세그먼트 개수
    inputFormat,
  };

  // 분석 결과 로깅
  if (issues.length > 0) {
    logger.warn('Media compatibility issues:');
    issues.forEach(issue => logger.warn(`  - ${issue}`));
  } else {
    logger.info('Media is fully compatible');
  }

  logger.info(`Segment duration: ${segmentDuration}s, Total segments: ${totalSegments} (GOP size: ${Math.round(fps * segmentDuration)} frames)`);

  return analysis;
}
