import { apiClient } from './client';
import type { MediaInfoResponse } from '@videoforest/types';
import { MediaInfoResponseSchema } from '@videoforest/types';
import { z } from 'zod';

// 타입 가드를 위한 검증 헬퍼
function validateResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

// 미디어 정보 조회
export async function getMediaInfo(mediaId: string, signal?: AbortSignal): Promise<MediaInfoResponse> {
  const response = await apiClient.get(`/stream/media/${mediaId}`, { signal });
  return validateResponse(MediaInfoResponseSchema, response.data);
}

/**
 * HLS Playlist URL 생성 (단일 품질)
 *
 * 단순화된 단일 품질 스트리밍
 * 서버가 원본 해상도에 맞춰 최적의 품질을 자동 선택합니다.
 */
export function getHLSPlaylistUrl(mediaId: string): string {
  const baseURL = apiClient.defaults.baseURL || '';
  return `${baseURL}/stream/hls/${mediaId}/playlist.m3u8`;
}

/**
 * 스트리밍 세션 종료
 */
export async function stopStreaming(mediaId: string): Promise<void> {
  await apiClient.delete(`/stream/hls/${mediaId}`);
}

/**
 * Playlist가 준비될 때까지 폴링
 */
export async function waitForPlaylist(mediaId: string, maxWaitMs: number = 30000, signal?: AbortSignal): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 1000; // 1초마다 확인

  while (Date.now() - startTime < maxWaitMs) {
    if (signal?.aborted) return false;
    try {
      // GET 요청으로 Playlist 존재 확인
      const response = await apiClient.get(`/stream/hls/${mediaId}/playlist.m3u8`, { signal });

      // 202 응답 (트랜스코딩 진행 중)은 계속 대기
      if (response.status === 202) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }

      // 200 응답이면 준비 완료
      return true;
    } catch (error: unknown) {
      // 요청이 취소된 경우 즉시 종료
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_CANCELED') {
        return false;
      }
      // 500 에러 (트랜스코딩 실패)는 즉시 실패 처리
      if (
        error &&
        typeof error === 'object' &&
        'response' in error &&
        error.response &&
        typeof error.response === 'object' &&
        'status' in error.response &&
        error.response.status === 500
      ) {
        return false;
      }

      // 404 또는 기타 에러는 계속 대기
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  return false; // 타임아웃
}
