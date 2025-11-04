import { type FastifyPluginAsync } from 'fastify';
import {
  RefreshMediaResponseSchema,
  ListMediaResponseSchema,
  MediaTreeResponseSchema,
  ScanEventSchema,
  type ScanEvent,
} from '@videoforest/types';
import { requireAuth } from '../middleware/auth.js';
import { refreshMediaLibrary, getMediaList, getMediaTree, refreshMediaLibraryWithProgress } from '../services/index.js';
//------------------------------------------------------------------------------//

interface MediaFromDatabase {
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

// 미디어 항목을 API 응답 형식으로 변환
function formatMediaForResponse(media: MediaFromDatabase) {
  return {
    ...media,
    // BigInt를 number로 변환 (JSON 직렬화 문제 해결)
    bitrate: media.bitrate !== null ? Number(media.bitrate) : null,
    fileSize: media.fileSize !== null ? Number(media.fileSize) : null,
    createdAt: media.createdAt.toISOString(),
    updatedAt: media.updatedAt.toISOString(),
  };
}

export const mediaRoutes: FastifyPluginAsync = async fastify => {
  fastify.addHook('preHandler', requireAuth);

  // 미디어 라이브러리 새로고침
  fastify.get('/refresh', async (_request, reply) => {
    const mediaList = await refreshMediaLibrary();
    const formattedMedia = mediaList.map(formatMediaForResponse);

    return reply.send(
      RefreshMediaResponseSchema.parse({
        success: true,
        count: mediaList.length,
        media: formattedMedia,
      })
    );
  });

  // 미디어 목록 조회
  fastify.get('/list', async (_request, reply) => {
    const mediaList = await getMediaList();
    const formattedMedia = mediaList.map(formatMediaForResponse);

    return reply.send(
      ListMediaResponseSchema.parse({
        success: true,
        count: mediaList.length,
        media: formattedMedia,
      })
    );
  });

  // 미디어 트리 구조 조회
  fastify.get('/tree', async (_request, reply) => {
    const tree = await getMediaTree();

    return reply.send(
      MediaTreeResponseSchema.parse({
        success: true,
        tree,
      })
    );
  });

  // 미디어 스캔 (Server-Sent Events)
  fastify.get('/scan', async (request, reply) => {
    // SSE 헤더 설정
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // SSE 이벤트 전송 헬퍼 함수
    const sendEvent = (event: ScanEvent) => {
      const validatedEvent = ScanEventSchema.parse(event);
      reply.raw.write(`data: ${JSON.stringify(validatedEvent)}\n\n`);
    };

    try {
      // 시작 이벤트 전송
      sendEvent({ type: 'start', message: 'Starting media scan...' });

      // 스캔 실행 (진행 상황 콜백)
      const result = await refreshMediaLibraryWithProgress((current, total, fileName) => {
        sendEvent({
          type: 'progress',
          current,
          total,
          fileName,
        });
      });

      // 완료 이벤트 전송
      sendEvent({
        type: 'complete',
        total: result.total,
        success: result.success,
        failed: result.failed,
      });

      reply.raw.end();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      // 에러 이벤트 전송
      sendEvent({
        type: 'error',
        message: errorMessage,
      });
      reply.raw.end();
    }
  });
};
