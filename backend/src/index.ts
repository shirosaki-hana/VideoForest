import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import apiRoutes from './api/index.js';
import { logger, detectFFmpeg, detectFFprobe } from './utils/index.js';
import { env, fastifyConfig, helmetConfig, rateLimitConfig, corsConfig, staticFilesConfig } from './config/index.js';
import { checkDatabaseConnection, disconnectDatabase } from './database/index.js';
import { notFoundHandler, errorHandler } from './handlers/index.js';
import { log } from 'console';
//------------------------------------------------------------------------------//

// Fastify 서버 생성
async function createFastifyApp() {
  const fastify = Fastify(fastifyConfig);

  await fastify.register(helmet, helmetConfig);
  await fastify.register(rateLimit, rateLimitConfig);
  await fastify.register(compress);
  await fastify.register(cors, corsConfig);
  await fastify.register(cookie);
  await fastify.register(apiRoutes, { prefix: '/api' }); // API 라우트
  await fastify.register(staticFiles, staticFilesConfig); // 정적 파일 서빙

  // SPA fallback 및 404 핸들러
  fastify.setNotFoundHandler(notFoundHandler);

  // 전역 에러 핸들러
  fastify.setErrorHandler(errorHandler);

  return fastify;
}

// 서버 시작 함수
async function startServer(port: number) {
  logger.info(`Starting server... [Environment: ${env.NODE_ENV}]`);
  
  const fastify = await createFastifyApp();
  await checkDatabaseConnection();
  await detectFFmpeg();
  await detectFFprobe();
  await fastify.listen({ port, host: env.HOST });
  
  logger.success(`Server is running on http://${env.HOST}:${port}`);

  return fastify;
}

// Graceful shutdown 핸들러
async function gracefulShutdown(fastify: Awaited<ReturnType<typeof createFastifyApp>>, signal: string) {
  logger.warn(`Received ${signal}: shutting down server...`);

  try {
    await fastify.close(); // Fastify 서버 종료
    await disconnectDatabase(); // 데이터베이스 연결 해제
    logger.success('Server closed successfully');
    process.exitCode = 0;
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exitCode = 1;
  }
}

// 메인 엔트리 포인트
async function main() {
  try {
    const fastify = await startServer(env.PORT);

    // 시그널 핸들러 등록
    process.on('SIGINT', () => {
      gracefulShutdown(fastify, 'SIGINT').catch(() => {});
    });
    process.on('SIGTERM', () => {
      gracefulShutdown(fastify, 'SIGTERM').catch(() => {});
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exitCode = 1;
  }
}

// 서버 시작
main();
