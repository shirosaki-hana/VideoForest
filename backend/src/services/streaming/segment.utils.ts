import path from 'path';
import type { SegmentInfo } from './types.js';
//------------------------------------------------------------------------------//

/**
 * 세그먼트 번호 → 시작 시간 변환
 * 
 * @param segmentNumber 세그먼트 번호 (0부터 시작)
 * @param segmentDuration 세그먼트 길이 (초)
 * @returns 시작 시간 (초)
 * 
 * @example
 * getSegmentStartTime(0, 6) // 0초
 * getSegmentStartTime(50, 6) // 300초 (5분)
 * getSegmentStartTime(100, 6) // 600초 (10분)
 */
export function getSegmentStartTime(segmentNumber: number, segmentDuration: number): number {
  return segmentNumber * segmentDuration;
}

/**
 * 시간 → 세그먼트 번호 변환
 * 
 * @param time 시간 (초)
 * @param segmentDuration 세그먼트 길이 (초)
 * @returns 세그먼트 번호
 * 
 * @example
 * getSegmentNumberFromTime(0, 6) // 0
 * getSegmentNumberFromTime(300, 6) // 50
 * getSegmentNumberFromTime(305, 6) // 50 (305초는 50번 세그먼트에 포함)
 */
export function getSegmentNumberFromTime(time: number, segmentDuration: number): number {
  return Math.floor(time / segmentDuration);
}

/**
 * 전체 세그먼트 개수 계산
 * 
 * @param duration 미디어 전체 길이 (초)
 * @param segmentDuration 세그먼트 길이 (초)
 * @returns 전체 세그먼트 개수
 * 
 * @example
 * calculateTotalSegments(600, 6) // 100 (정확히 나누어떨어짐)
 * calculateTotalSegments(605, 6) // 101 (마지막 5초도 하나의 세그먼트)
 */
export function calculateTotalSegments(duration: number, segmentDuration: number): number {
  return Math.ceil(duration / segmentDuration);
}

/**
 * 세그먼트 파일명 생성
 * 
 * @param segmentNumber 세그먼트 번호 (0부터 시작)
 * @returns 파일명 (segment_000.ts 형식)
 * 
 * @example
 * getSegmentFileName(0) // "segment_000.ts"
 * getSegmentFileName(50) // "segment_050.ts"
 * getSegmentFileName(999) // "segment_999.ts"
 */
export function getSegmentFileName(segmentNumber: number): string {
  return `segment_${segmentNumber.toString().padStart(3, '0')}.ts`;
}

/**
 * 세그먼트 파일명 → 번호 추출
 * 
 * @param fileName 파일명 (segment_050.ts)
 * @returns 세그먼트 번호 또는 null (파싱 실패)
 * 
 * @example
 * parseSegmentNumber("segment_050.ts") // 50
 * parseSegmentNumber("segment_000.ts") // 0
 * parseSegmentNumber("invalid.ts") // null
 */
export function parseSegmentNumber(fileName: string): number | null {
  const match = fileName.match(/segment_(\d+)\.ts/);
  if (!match) {
    return null;
  }
  return parseInt(match[1], 10);
}

/**
 * 세그먼트 전체 경로 생성
 * 
 * @param mediaId 미디어 ID
 * @param quality 화질 (예: "720p")
 * @param segmentNumber 세그먼트 번호
 * @param baseDir 기본 디렉터리 (기본값: temp/hls)
 * @returns 세그먼트 전체 경로
 * 
 * @example
 * getSegmentPath("media123", "720p", 50)
 * // "temp/hls/media123/720p/segment_050.ts"
 */
export function getSegmentPath(
  mediaId: string,
  quality: string,
  segmentNumber: number,
  baseDir: string = 'temp/hls'
): string {
  const fileName = getSegmentFileName(segmentNumber);
  return path.join(baseDir, mediaId, quality, fileName);
}

/**
 * 화질별 디렉터리 경로
 * 
 * @param mediaId 미디어 ID
 * @param quality 화질
 * @param baseDir 기본 디렉터리
 * @returns 화질별 디렉터리 경로
 */
export function getQualityDir(
  mediaId: string,
  quality: string,
  baseDir: string = 'temp/hls'
): string {
  return path.join(baseDir, mediaId, quality);
}

/**
 * 미디어 루트 디렉터리 경로
 * 
 * @param mediaId 미디어 ID
 * @param baseDir 기본 디렉터리
 * @returns 미디어 루트 디렉터리 경로
 */
export function getMediaDir(
  mediaId: string,
  baseDir: string = 'temp/hls'
): string {
  return path.join(baseDir, mediaId);
}

/**
 * 플레이리스트 경로
 * 
 * @param mediaId 미디어 ID
 * @param quality 화질 (master일 경우 master.m3u8, 아니면 화질별 playlist.m3u8)
 * @param baseDir 기본 디렉터리
 * @returns 플레이리스트 파일 경로
 */
export function getPlaylistPath(
  mediaId: string,
  quality: string | 'master',
  baseDir: string = 'temp/hls'
): string {
  if (quality === 'master') {
    return path.join(baseDir, mediaId, 'master.m3u8');
  }
  return path.join(baseDir, mediaId, quality, 'playlist.m3u8');
}

/**
 * 세그먼트 정보 생성
 * 
 * @param segmentNumber 세그먼트 번호
 * @param segmentDuration 세그먼트 길이 (초)
 * @param totalDuration 전체 미디어 길이 (초)
 * @returns 세그먼트 정보
 */
export function createSegmentInfo(
  segmentNumber: number,
  segmentDuration: number,
  totalDuration: number
): SegmentInfo {
  const startTime = getSegmentStartTime(segmentNumber, segmentDuration);
  
  // 마지막 세그먼트는 남은 시간만큼만
  const duration = Math.min(segmentDuration, totalDuration - startTime);
  
  return {
    segmentNumber,
    startTime,
    duration,
    fileName: getSegmentFileName(segmentNumber),
  };
}

/**
 * 모든 세그먼트 정보 생성 (플레이리스트용)
 * 
 * @param totalDuration 전체 미디어 길이 (초)
 * @param segmentDuration 세그먼트 길이 (초)
 * @returns 모든 세그먼트 정보 배열
 */
export function createAllSegmentInfos(
  totalDuration: number,
  segmentDuration: number
): SegmentInfo[] {
  const totalSegments = calculateTotalSegments(totalDuration, segmentDuration);
  const segments: SegmentInfo[] = [];
  
  for (let i = 0; i < totalSegments; i++) {
    segments.push(createSegmentInfo(i, segmentDuration, totalDuration));
  }
  
  return segments;
}

