import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import apiRoutes from './api/index.js';
import { logger, detectFFmpeg, detectFFprobe } from './utils/index.js';
import { env, isDevelopment, fastifyConfig, helmetConfig, rateLimitConfig, corsConfig, staticFilesConfig } from './config/index.js';
import { checkDatabaseConnection, disconnectDatabase } from './database/index.js';
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

  // SPA fallback: API가 아닌 모든 GET 요청을 index.html로 처리
  fastify.setNotFoundHandler(async (request, reply) => {
    // API 요청은 404 반환
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `Route ${request.method}:${request.url} not found`,
      });
    }

    // GET 요청이고 Accept 헤더가 HTML을 포함하면 index.html 반환 (SPA 라우팅)
    if (request.method === 'GET' && request.headers.accept?.includes('text/html')) {
      return reply.type('text/html').sendFile('index.html');
    }

    // 그 외의 경우 404 반환
    return reply.code(404).send({
      error: 'Not Found',
      message: `Resource ${request.url} not found`,
    });
  });

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
  await detectFFmpeg();
  await detectFFprobe();
  await fastify.listen({ port, host: env.HOST });

  logger.info(`Environment: ${env.NODE_ENV}`);
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
