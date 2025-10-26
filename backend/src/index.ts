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
import { logger, projectRoot, detectFFmpeg, detectFFprobe } from './utils/index.js';
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

  // API 라우트를 먼저 등록 (우선순위 높음)
  await fastify.register(apiRoutes, { prefix: '/api' });

  // 정적 파일 서빙
  await fastify.register(staticFiles, staticFilesConfig);

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

  // FFmpeg/FFprobe 감지 및 기능 확인
  await detectFFmpeg();
  await detectFFprobe();

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

      try {

        // Fastify 서버 종료
        await fastify.close();

        // 데이터베이스 연결 해제
        await disconnectDatabase();

        logger.success('Server closed successfully');
        // eslint-disable-next-line no-process-exit
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        // eslint-disable-next-line no-process-exit
        process.exit(1);
      }
    };

    process.on('SIGINT', () => {
      gracefulShutdown('SIGINT').catch(error => {
        logger.error('Error in SIGINT handler:', error);
    // eslint-disable-next-line no-process-exit        
        process.exit(1);
      });
    });
    process.on('SIGTERM', () => {
      gracefulShutdown('SIGTERM').catch(error => {
        logger.error('Error in SIGTERM handler:', error);
     // eslint-disable-next-line no-process-exit       
        process.exit(1);
      });
    });
  })
  .catch(async error => {
    logger.error('Failed to start server:', error);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
