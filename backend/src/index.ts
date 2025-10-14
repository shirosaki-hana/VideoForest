import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import staticFiles from '@fastify/static';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/log.js';
import { env, isProduction, isDevelopment } from './config/index.js';
import { parseDurationToJustMs } from './utils/time.js';
import { checkDatabaseConnection, disconnectDatabase } from './database/index.js';
//------------------------------------------------------------------------------//
dotenv.config({ quiet: true });

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

// 서버 고정 설정
const fastifyConfig = { bodyLimit: parseInt(env.REQUEST_BODY_LIMIT.replace('mb', '')) * 1024 * 1024 };
const corsConfig = { origin: isDevelopment ? true : env.FRONTEND_URL, credentials: true };
const staticFilesConfig = {
  root: path.join(__dirname, '../../frontend/dist'),
  prefix: '/',
  cacheControl: isProduction,
  etag: true,
  lastModified: true,
  maxAge: isProduction ? parseDurationToJustMs('1d') : 0,
};

// Fastify 서버 생성
async function createFastifyApp() {
  const fastify = Fastify(fastifyConfig);

  await fastify.register(helmet);
  await fastify.register(compress);
  await fastify.register(cors, corsConfig);
  await fastify.register(cookie);
  await fastify.register(staticFiles, staticFilesConfig);

  fastify.setNotFoundHandler(async (request, reply) => {
    if (request.method === 'GET') {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not Found' });
  });

  fastify.setErrorHandler(async (error, request, reply) => {
    logger.error('Unhandled error:', error);
    return reply.code(500).send({
      error: isDevelopment ? error.message : 'Internal server error',
    });
  });

  return fastify;
}

// 서버 시작 함수
async function startServer(port: number) {
  const fastify = await createFastifyApp();
  await checkDatabaseConnection();

  await fastify.listen({ port, host: '127.0.0.1' });
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.success(`Server is running on http://127.0.0.1:${port}`);

  return fastify;
}

// 메인 엔트리 포인트(서버 시작과 안전 종료)
startServer(env.PORT)
  .then(fastify => {
    const gracefulShutdown = async (signal: string) => {
      logger.warn(`Received ${signal}: shutting down server...`);

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
