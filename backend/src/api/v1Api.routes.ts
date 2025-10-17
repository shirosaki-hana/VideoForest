import { type FastifyPluginAsync } from 'fastify';
import { ProtectedPingResponseSchema } from '@videoforest/types';
import { requireAuth } from '../middleware/auth.js';

/**
 * 메인 API
 */
export const v1ApiRoutes: FastifyPluginAsync = async fastify => {
  fastify.addHook('preHandler', requireAuth);

  // 테스트 엔드포인트
  fastify.get('/ping', async (_request, reply) => {
    return reply.send(ProtectedPingResponseSchema.parse({ pong: true }));
  });
};
