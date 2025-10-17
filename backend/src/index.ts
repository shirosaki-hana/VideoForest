import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import apiRoutes from './api/index.js';
import path from 'path';

import ms from 'ms';
import { logger, projectRoot } from './utils/index.js';
import { env, isProduction, isDevelopment } from './config/index.js';
import { checkDatabaseConnection, disconnectDatabase } from './database/index.js';
//------------------------------------------------------------------------------//

// 서버 고정 설정
const fastifyConfig = { bodyLimit: parseInt(env.REQUEST_BODY_LIMIT.replace('mb', '')) * 1024 * 1024 };
const corsConfig = {
  origin: isDevelopment ? true : env.FRONTEND_URL,
  credentials: true,
};
const helmetConfig = {
  contentSecurityPolicy: isProduction ? undefined : false,
  crossOriginEmbedderPolicy: false,
};
const rateLimitConfig = {
  max: env.RATELIMIT_MAX,
  timeWindow: ms(env.RATELIMIT_WINDOWMS),
};
const staticFilesConfig = {
  root: path.join(projectRoot, 'frontend/dist'),
  prefix: '/',
  cacheControl: isProduction,
  etag: true,
  lastModified: true,
  maxAge: isProduction ? ms('1d') : 0,
};

// Fastify 서버 생성
async function createFastifyApp() {
  const fastify = Fastify(fastifyConfig);
  await fastify.register(helmet, helmetConfig);
  await fastify.register(rateLimit, rateLimitConfig);
  await fastify.register(compress);
  await fastify.register(cors, corsConfig);
  await fastify.register(cookie);
  await fastify.register(apiRoutes, { prefix: '/api' });
  await fastify.register(staticFiles, staticFilesConfig);

  // 전역 에러 핸들러
  fastify.setErrorHandler(async (error, request, reply) => {
    logger.error('Unhandled error:', error);

    const statusCode = error.statusCode || 500;

    return reply.code(statusCode).send({
      error: isDevelopment ? error.message : 'Internal server error',
      ...(isDevelopment && { stack: error.stack }),
    });
  });

  return fastify;
}

// 서버 시작 함수
async function startServer(port: number) {
  const fastify = await createFastifyApp();
  await checkDatabaseConnection();

  await fastify.listen({ port, host: env.HOST });
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.success(`Server is running on http://${env.HOST}:${port}`);

  return fastify;
}

// 메인 엔트리 포인트(서버 시작과 안전 종료)
startServer(env.PORT)
  .then(fastify => {
    const gracefulShutdown = async (signal: string) => {
      logger.warn(`Received ${signal}: shutting down server...`);

      // 스트리밍 세션 종료
      const { stopAllStreaming } = await import('./services/index.js');
      await stopAllStreaming();

      await fastify.close();
      await disconnectDatabase();

      logger.success('Server closed');
    };
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  })
  .catch(async error => {
    logger.error('Failed to start server:', error);
    throw error;
  });
