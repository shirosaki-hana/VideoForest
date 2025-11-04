import { apiClient } from './client';
import type { RefreshMediaResponse, ListMediaResponse, MediaTreeResponse, ScanEvent } from '@videoforest/types';
import { RefreshMediaResponseSchema, ListMediaResponseSchema, MediaTreeResponseSchema, ScanEventSchema } from '@videoforest/types';
import { z } from 'zod';

// 타입 가드를 위한 검증 헬퍼
function validateResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

// 미디어 목록 조회 (평면 리스트)
export async function getMediaList(): Promise<ListMediaResponse> {
  const response = await apiClient.get('/media/list');
  return validateResponse(ListMediaResponseSchema, response.data);
}

// 미디어 트리 구조 조회
export async function getMediaTree(): Promise<MediaTreeResponse> {
  const response = await apiClient.get('/media/tree');
  return validateResponse(MediaTreeResponseSchema, response.data);
}

// 미디어 라이브러리 새로고침 (일반 HTTP)
export async function refreshMediaLibrary(): Promise<RefreshMediaResponse> {
  const response = await apiClient.get('/media/refresh');
  return validateResponse(RefreshMediaResponseSchema, response.data);
}

// 미디어 스캔 (Server-Sent Events)
export function scanMediaLibrary(
  onEvent: (event: ScanEvent) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void
): () => void {
  const eventSource = new EventSource('/api/media/scan', {
    withCredentials: true,
  });

  eventSource.onmessage = event => {
    try {
      const data = JSON.parse(event.data);
      const validatedEvent = validateResponse(ScanEventSchema, data);
      onEvent(validatedEvent);

      // complete나 error 이벤트면 연결 종료
      if (validatedEvent.type === 'complete' || validatedEvent.type === 'error') {
        eventSource.close();
        if (onComplete) {
          onComplete();
        }
      }
    } catch (error) {
      eventSource.close();
      if (onError) {
        onError(error as Error);
      }
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    if (onError) {
      onError(new Error('SSE connection failed'));
    }
  };

  // 연결 종료 함수 반환
  return () => {
    eventSource.close();
  };
}
