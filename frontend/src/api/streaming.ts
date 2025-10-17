import { apiClient } from './client';
import type { MediaInfoResponse } from '@videoforest/types';
import { MediaInfoResponseSchema } from '@videoforest/types';
import { z } from 'zod';

// 타입 가드를 위한 검증 헬퍼
function validateResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

// 미디어 정보 조회
export async function getMediaInfo(mediaId: string): Promise<MediaInfoResponse> {
  const response = await apiClient.get(`/stream/media/${mediaId}`);
  return validateResponse(MediaInfoResponseSchema, response.data);
}

/**
 * HLS Master Playlist URL 생성 (ABR 지원)
 * 
 * Master Playlist는 여러 품질을 나열하며,
 * video.js가 네트워크 상태에 따라 자동으로 최적의 품질을 선택합니다.
 */
export function getHLSMasterPlaylistUrl(mediaId: string): string {
  const baseURL = apiClient.defaults.baseURL || '';
  return `${baseURL}/stream/hls/${mediaId}/master.m3u8`;
}

/**
 * 스트리밍 세션 종료
 */
export async function stopStreaming(mediaId: string): Promise<void> {
  await apiClient.delete(`/stream/hls/${mediaId}`);
}

/**
 * Master Playlist가 준비될 때까지 폴링
 */
export async function waitForPlaylist(mediaId: string, maxWaitMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 500; // 0.5초마다 확인

  while (Date.now() - startTime < maxWaitMs) {
    try {
      // HEAD 요청으로 Master Playlist 존재 확인
      await apiClient.head(`/stream/hls/${mediaId}/master.m3u8`);
      return true; // Master Playlist 준비 완료!
    } catch (error) {
      // 아직 준비 안됨, 계속 대기
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  return false; // 타임아웃
}
