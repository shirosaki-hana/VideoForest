import type { QualityProfile, SegmentInfo } from './types.js';
import { createAllSegmentInfos } from './segment.utils.js';
//------------------------------------------------------------------------------//

/**
 * Master Playlist 생성 (모든 화질 나열)
 * 
 * HLS ABR을 위한 마스터 플레이리스트
 * 각 화질의 상대 경로를 포함
 * 
 * @param profiles 사용 가능한 화질 프로파일
 * @returns Master Playlist 내용
 */
export function generateMasterPlaylist(profiles: QualityProfile[]): string {
  const lines: string[] = [];
  
  // HLS 버전 (v3: 기본적인 ABR 지원)
  lines.push('#EXTM3U');
  lines.push('#EXT-X-VERSION:3');
  lines.push('');
  
  // 각 화질별 variant 나열 (높은 화질부터)
  const sortedProfiles = [...profiles].sort((a, b) => {
    // 높이 기준 내림차순
    return b.height - a.height;
  });
  
  for (const profile of sortedProfiles) {
    // 비트레이트를 bps 단위로 변환 (예: "3M" -> 3000000)
    const bandwidth = parseBitrate(profile.videoBitrate);
    
    // #EXT-X-STREAM-INF: variant 정보
    lines.push('#EXT-X-STREAM-INF:' + [
      `BANDWIDTH=${bandwidth}`,
      `RESOLUTION=${profile.width}x${profile.height}`,
      `NAME="${profile.name}"`,
    ].join(','));
    
    // variant 플레이리스트 경로 (상대 경로)
    lines.push(`${profile.name}/playlist.m3u8`);
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * 화질별 Playlist 생성 (세그먼트 나열)
 * 
 * 실제 세그먼트 파일이 없어도 duration 기반으로 "구라" 플레이리스트 생성
 * VOD 타입으로 생성하여 전체 길이를 미리 알림
 * 
 * @param totalDuration 전체 미디어 길이 (초)
 * @param segmentDuration 세그먼트 길이 (초)
 * @returns Playlist 내용
 */
export function generateQualityPlaylist(
  totalDuration: number,
  segmentDuration: number
): string {
  const lines: string[] = [];
  
  // HLS 버전 및 설정
  lines.push('#EXTM3U');
  lines.push('#EXT-X-VERSION:3');
  lines.push(`#EXT-X-TARGETDURATION:${Math.ceil(segmentDuration)}`);
  lines.push('#EXT-X-MEDIA-SEQUENCE:0');
  
  // EVENT 타입으로 변경 - JIT 트랜스코딩과 호환
  // VOD는 모든 세그먼트가 즉시 사용 가능해야 하지만,
  // EVENT는 세그먼트가 동적으로 생성될 수 있음
  // lines.push('#EXT-X-PLAYLIST-TYPE:EVENT');
  lines.push('');
  
  // 모든 세그먼트 나열 (구라 플레이리스트)
  const segments = createAllSegmentInfos(totalDuration, segmentDuration);
  
  for (const segment of segments) {
    // #EXTINF: 세그먼트 길이 정보
    // 정확한 duration 대신 targetDuration 사용 (더 관대함)
    lines.push(`#EXTINF:${segmentDuration.toFixed(3)},`);
    // 세그먼트 파일명 (상대 경로)
    lines.push(segment.fileName);
  }
  
  // ENDLIST를 제거하면 LIVE처럼 동작 (세그먼트 동적 추가 가능)
  // 하지만 seek이 필요하므로 일단 유지
  lines.push('#EXT-X-ENDLIST');
  
  return lines.join('\n');
}

/**
 * 비트레이트 문자열 → bps 변환
 * 
 * @param bitrate 비트레이트 문자열 (예: "3M", "500k")
 * @returns bps 단위 숫자
 * 
 * @example
 * parseBitrate("3M") // 3000000
 * parseBitrate("500k") // 500000
 * parseBitrate("1500k") // 1500000
 */
function parseBitrate(bitrate: string): number {
  const value = parseFloat(bitrate);
  
  if (bitrate.endsWith('M') || bitrate.endsWith('m')) {
    return value * 1_000_000;
  }
  
  if (bitrate.endsWith('k') || bitrate.endsWith('K')) {
    return value * 1_000;
  }
  
  // 단위가 없으면 그대로 (bps)
  return value;
}

/**
 * 세그먼트 정보 배열 → Playlist 내용 생성
 * (고급 사용: 일부 세그먼트만 포함하고 싶을 때)
 * 
 * @param segments 세그먼트 정보 배열
 * @param isVod VOD 타입 여부 (true면 #EXT-X-ENDLIST 추가)
 * @returns Playlist 내용
 */
export function generatePlaylistFromSegments(
  segments: SegmentInfo[],
  isVod: boolean = true
): string {
  if (segments.length === 0) {
    throw new Error('Cannot generate playlist: no segments provided');
  }
  
  const lines: string[] = [];
  const maxDuration = Math.max(...segments.map(s => s.duration));
  
  lines.push('#EXTM3U');
  lines.push('#EXT-X-VERSION:3');
  lines.push(`#EXT-X-TARGETDURATION:${Math.ceil(maxDuration)}`);
  lines.push(`#EXT-X-MEDIA-SEQUENCE:${segments[0].segmentNumber}`);
  
  if (isVod) {
    lines.push('#EXT-X-PLAYLIST-TYPE:VOD');
  }
  
  lines.push('');
  
  for (const segment of segments) {
    lines.push(`#EXTINF:${segment.duration.toFixed(6)},`);
    lines.push(segment.fileName);
  }
  
  if (isVod) {
    lines.push('#EXT-X-ENDLIST');
  }
  
  return lines.join('\n');
}

