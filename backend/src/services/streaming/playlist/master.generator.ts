import type { QualityProfile } from '../types.js';
//------------------------------------------------------------------------------//

/**
 * HLS Master Playlist 생성
 * 
 * Master Playlist는 사용 가능한 모든 품질(variants)을 나열하며,
 * video.js가 네트워크 상태에 따라 적절한 품질을 선택할 수 있게 합니다.
 */
export function generateMasterPlaylist(profiles: QualityProfile[]): string {
  const lines: string[] = ['#EXTM3U', '#EXT-X-VERSION:3'];

  profiles.forEach((profile, index) => {
    // 대역폭 계산 (비트레이트를 bps로 변환)
    const bandwidth = parseBandwidth(profile.videoBitrate) + parseBandwidth(profile.audioBitrate);

    // #EXT-X-STREAM-INF 태그
    // BANDWIDTH: 전체 비트레이트 (bps)
    // RESOLUTION: 비디오 해상도
    // NAME: 품질 이름 (선택사항, 일부 플레이어에서 표시)
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${profile.width}x${profile.height},NAME="${profile.name}"`,
      `v${index}/playlist.m3u8`
    );
  });

  return lines.join('\n') + '\n';
}

/**
 * 비트레이트 문자열을 bps로 변환
 * 예: '5M' -> 5000000, '2500k' -> 2500000, '128k' -> 128000
 */
function parseBandwidth(bitrateStr: string): number {
  const match = bitrateStr.match(/^(\d+(?:\.\d+)?)(k|K|m|M)?$/);
  if (!match) {
    throw new Error(`Invalid bitrate format: ${bitrateStr}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2]?.toLowerCase();

  switch (unit) {
    case 'm':
      return value * 1000000;
    case 'k':
      return value * 1000;
    default:
      return value;
  }
}

