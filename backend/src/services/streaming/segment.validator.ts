import { logger, probeSegment as probeSegmentInfo } from '../../utils/index.js';
//------------------------------------------------------------------------------//

/**
 * 세그먼트 검증 정보
 */
export interface SegmentValidation {
  isValid: boolean;
  actualDuration: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  startsWithKeyframe: boolean;
  fileSize: number;
  errors: string[];
}

/**
 * 생성된 세그먼트 파일 검증
 * 
 * FFprobe를 사용하여 세그먼트의 실제 정보를 확인합니다.
 * 디버깅 및 품질 검증에 유용합니다.
 * 
 * @param segmentPath 세그먼트 파일 경로
 * @returns 검증 결과
 */
export async function validateSegment(segmentPath: string): Promise<SegmentValidation> {
  const errors: string[] = [];
  
  try {
    const fs = await import('fs');
    const stats = fs.statSync(segmentPath);
    
    if (!stats.isFile()) {
      errors.push('Not a file');
      return {
        isValid: false,
        actualDuration: null,
        hasVideo: false,
        hasAudio: false,
        startsWithKeyframe: false,
        fileSize: 0,
        errors,
      };
    }

    const fileSize = stats.size;

    if (fileSize === 0) {
      errors.push('Empty file');
      return {
        isValid: false,
        actualDuration: null,
        hasVideo: false,
        hasAudio: false,
        startsWithKeyframe: false,
        fileSize: 0,
        errors,
      };
    }

    // FFprobe로 세그먼트 분석 (통합된 API 사용)
    const probeResult = await probeSegmentInfo(segmentPath);

    if (!probeResult.hasVideo) {
      errors.push('No video stream');
    }

    if (!probeResult.hasAudio) {
      errors.push('No audio stream (might be OK if original has no audio)');
    }

    if (!probeResult.startsWithKeyframe) {
      errors.push('Does not start with keyframe - playback will be broken!');
    }

    const isValid = probeResult.hasVideo && probeResult.startsWithKeyframe;

    return {
      isValid,
      actualDuration: probeResult.duration,
      hasVideo: probeResult.hasVideo,
      hasAudio: probeResult.hasAudio,
      startsWithKeyframe: probeResult.startsWithKeyframe,
      fileSize,
      errors,
    };
  } catch (error) {
    errors.push(`Validation error: ${error}`);
    return {
      isValid: false,
      actualDuration: null,
      hasVideo: false,
      hasAudio: false,
      startsWithKeyframe: false,
      fileSize: 0,
      errors,
    };
  }
}

/**
 * 세그먼트 검증 결과 로깅
 */
export function logValidationResult(
  segmentNumber: number,
  expectedDuration: number,
  validation: SegmentValidation
): void {
  if (validation.isValid) {
    const durationDiff = validation.actualDuration 
      ? Math.abs(validation.actualDuration - expectedDuration)
      : 0;
    
    // HLS 스펙: 실제 duration이 예상보다 약간 길 수 있음 (GOP 경계)
    // 플레이리스트에 +0.05초 안전 마진이 추가되어 있으므로
    // 0.1초 이상 차이나면 경고
    if (durationDiff > 0.1) {
      logger.warn(
        `Segment ${segmentNumber}: Duration mismatch! ` +
        `Expected ${expectedDuration}s, got ${validation.actualDuration}s (diff: ${durationDiff.toFixed(3)}s)`
      );
    } else {
      logger.debug?.(
        `Segment ${segmentNumber} validated: ${validation.actualDuration?.toFixed(3)}s, ` +
        `${(validation.fileSize / 1024).toFixed(3)}KB`
      );
    }
  } else {
    logger.error(
      `Segment ${segmentNumber} validation FAILED:\n` +
      validation.errors.map(e => `  - ${e}`).join('\n')
    );
  }
}

