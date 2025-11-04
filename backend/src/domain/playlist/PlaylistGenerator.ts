import type { QualityProfile, SegmentInfo, AccurateSegmentInfo } from '../types.js';
import { SegmentUtils } from '../segment/SegmentUtils.js';
//------------------------------------------------------------------------------//

/**
 * HLS 플레이리스트 생성 로직
 *
 * 책임:
 * - Master Playlist 생성 (ABR)
 * - 화질별 Playlist 생성
 * - 세그먼트 정보 포맷팅
 */
export class PlaylistGenerator {
  /**
   * Master Playlist 생성 (모든 화질 나열)
   *
   * HLS ABR을 위한 마스터 플레이리스트
   * 각 화질의 상대 경로를 포함
   */
  static generateMaster(profiles: QualityProfile[]): string {
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
      const bandwidth = this.parseBitrate(profile.videoBitrate);

      // #EXT-X-STREAM-INF: variant 정보
      lines.push(
        '#EXT-X-STREAM-INF:' +
          [`BANDWIDTH=${bandwidth}`, `RESOLUTION=${profile.width}x${profile.height}`, `NAME="${profile.name}"`].join(',')
      );

      // variant 플레이리스트 경로 (상대 경로)
      lines.push(`${profile.name}/playlist.m3u8`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 화질별 Playlist 생성 (세그먼트 나열)
   *
   * 키프레임 기반 정확한 세그먼트가 있으면 실제 duration 사용,
   * 없으면 근사값 기반 플레이리스트 생성
   */
  static generateQuality(totalDuration: number, segmentDuration: number, accurateSegments?: AccurateSegmentInfo[]): string {
    const lines: string[] = [];

    // 정확한 세그먼트가 있으면 사용, 없으면 근사값 사용
    const useAccurateSegments = accurateSegments && accurateSegments.length > 0;

    // TARGETDURATION 계산 (최대 세그먼트 길이 올림)
    // HLS 스펙: 모든 세그먼트의 실제 duration은 TARGETDURATION 이하여야 함
    let targetDuration: number;
    if (useAccurateSegments) {
      const safetyMargin = 0.05; // 50ms 안전 마진
      const maxDuration = Math.max(...accurateSegments!.map(s => s.duration));
      targetDuration = Math.ceil(maxDuration + safetyMargin);
    } else {
      targetDuration = Math.ceil(segmentDuration);
    }

    // HLS 버전 및 설정
    lines.push('#EXTM3U');
    lines.push('#EXT-X-VERSION:3');
    // 세그먼트가 독립적으로 디코딩 가능함을 명시 (IDR 시작)
    lines.push('#EXT-X-INDEPENDENT-SEGMENTS');
    lines.push(`#EXT-X-TARGETDURATION:${targetDuration}`);
    lines.push('#EXT-X-MEDIA-SEQUENCE:0');
    lines.push('#EXT-X-PLAYLIST-TYPE:VOD'); // VOD 타입 (전체 길이 고정)
    lines.push('');

    // 세그먼트 나열
    if (useAccurateSegments) {
      // 정확한 duration 사용 (키프레임 기반)
      // HLS 스펙: EXTINF는 실제 duration보다 크거나 같아야 함
      // FFmpeg의 -t 옵션이 GOP 경계로 인해 약간 더 길게 출력할 수 있으므로
      // 안전 마진(+0.05초)을 추가하여 스펙 준수
      for (let i = 0; i < accurateSegments!.length; i++) {
        const segment = accurateSegments![i];
        const safetyMargin = 0.05; // 50ms 안전 마진
        const safeDuration = segment.duration + safetyMargin;
        // 첫 세그먼트를 제외하고 불연속 선언
        if (i > 0) {
          lines.push('#EXT-X-DISCONTINUITY');
        }
        lines.push(`#EXTINF:${safeDuration.toFixed(3)},`);
        lines.push(segment.fileName);
      }
    } else {
      // 근사값 사용 (구라 플레이리스트)
      const segments = SegmentUtils.createAllInfos(totalDuration, segmentDuration);
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        // 첫 세그먼트를 제외하고 불연속 선언
        if (i > 0) {
          lines.push('#EXT-X-DISCONTINUITY');
        }
        lines.push(`#EXTINF:${segmentDuration.toFixed(3)},`);
        lines.push(segment.fileName);
      }
    }

    lines.push('#EXT-X-ENDLIST');

    return lines.join('\n');
  }

  /**
   * 세그먼트 정보 배열 → Playlist 내용 생성
   * (고급 사용: 일부 세그먼트만 포함하고 싶을 때)
   */
  static generateFromSegments(segments: SegmentInfo[] | AccurateSegmentInfo[], isVod: boolean = true): string {
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
      // 실제 duration 사용 (소수점 3자리)
      lines.push(`#EXTINF:${segment.duration.toFixed(3)},`);
      lines.push(segment.fileName);
    }

    if (isVod) {
      lines.push('#EXT-X-ENDLIST');
    }

    return lines.join('\n');
  }

  /**
   * 비트레이트 문자열 → bps 변환
   *
   * @example
   * parseBitrate("3M") // 3000000
   * parseBitrate("500k") // 500000
   * parseBitrate("1500k") // 1500000
   */
  private static parseBitrate(bitrate: string): number {
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
}
