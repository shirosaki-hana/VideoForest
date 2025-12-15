import { type FastifyPluginAsync } from 'fastify';
import { authRoutes } from './auth.routes.js';
import { healthRoutes } from './health.routes.js';
import { mediaRoutes } from './media.routes.js';
import { streamingRoutes } from './streaming.routes.js';
import { logsRoutes } from './logs.routes.js';

export const apiRoutes: FastifyPluginAsync = async fastify => {
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(healthRoutes, { prefix: '/health' });
  await fastify.register(mediaRoutes, { prefix: '/media' });
  await fastify.register(streamingRoutes, { prefix: '/stream' });
  await fastify.register(logsRoutes, { prefix: '/logs' });
};

export default apiRoutes;
