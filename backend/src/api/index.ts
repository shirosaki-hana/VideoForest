import { type FastifyPluginAsync } from 'fastify';
import { authRoutes } from './auth.routes.js';
import { mainApiRoutes } from './mainApi.routes.js';

export const apiRoutes: FastifyPluginAsync = async fastify => {
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(mainApiRoutes, { prefix: '/api' });
};

export default apiRoutes;
