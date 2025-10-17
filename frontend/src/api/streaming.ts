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

// HLS 플레이리스트 URL 생성
export function getHLSPlaylistUrl(mediaId: string): string {
  // apiClient의 baseURL을 사용하여 전체 URL 생성
  const baseURL = apiClient.defaults.baseURL || '';
  return `${baseURL}/stream/hls/${mediaId}/playlist.m3u8`;
}

