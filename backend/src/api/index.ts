import { type FastifyPluginAsync } from 'fastify';
import { authRoutes } from './auth.routes.js';
import { mediaRoutes } from './media.routes.js';
import { streamingRoutes } from './streaming.routes.js';

export const apiRoutes: FastifyPluginAsync = async fastify => {
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(mediaRoutes, { prefix: '/media' });
  await fastify.register(streamingRoutes, { prefix: '/stream' });
};

export default apiRoutes;
