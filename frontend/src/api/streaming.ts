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
 * HLS Master Playlist URL 생성 (ABR 지원)
 *
 * Lazy ABR:
 * - Master Playlist는 모든 사용 가능한 품질을 나열
 * - Video.js가 자동으로 적절한 품질 선택
 * - 요청된 품질만 서버에서 on-demand로 트랜스코딩
 */
export function getHLSPlaylistUrl(mediaId: string): string {
  const baseURL = apiClient.defaults.baseURL || '';
  return `${baseURL}/stream/hls/${mediaId}/master.m3u8`;
}

/**
 * Master Playlist가 준비될 때까지 폴링
 */
export async function waitForPlaylist(mediaId: string, maxWaitMs: number = 30000, signal?: AbortSignal): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 1000; // 1초마다 확인

  while (Date.now() - startTime < maxWaitMs) {
    if (signal?.aborted) return false;
    try {
      // GET 요청으로 Master Playlist 존재 확인
      const response = await apiClient.get(`/stream/hls/${mediaId}/master.m3u8`, { signal });

      // 202 응답 (세션 초기화 중)은 계속 대기
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
