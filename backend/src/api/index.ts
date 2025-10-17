import { type FastifyPluginAsync } from 'fastify';
import { authRoutes } from './auth.routes.js';
import { v1ApiRoutes } from './v1Api.routes.js';
import { streamingRoutes } from './streaming.routes.js';

export const apiRoutes: FastifyPluginAsync = async fastify => {
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(v1ApiRoutes, { prefix: '/v1' });
  await fastify.register(streamingRoutes, { prefix: '/stream' });
};

export default apiRoutes;
