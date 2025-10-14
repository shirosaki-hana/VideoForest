import Fastify from 'fastify';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
// Fastify plugins
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import staticFiles from '@fastify/static';
// Utils
import { logger } from './utils/log.js';
import { env, isProduction, isDevelopment } from './config/envConfig.js';
import { parseDurationToJustMs } from './utils/time.js';
import { checkDatabaseConnection, disconnectDatabase } from './lib/database.js';

dotenv.config({ quiet: true });

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);
const frontendDistPath: string = path.join(__dirname, '../../frontend/dist');

async function createFastifyApp() {
  const fastify = Fastify({
    logger: false,
    bodyLimit: parseInt(env.REQUEST_BODY_LIMIT.replace('mb', '')) * 1024 * 1024,
  });

  if (!isDevelopment) {
    await fastify.register(helmet);
  }

  await fastify.register(compress);
  await fastify.register(cors, { origin: isDevelopment ? true : env.FRONTEND_URL, credentials: true });
  await fastify.register(cookie);
  await fastify.register(staticFiles, {
    root: frontendDistPath,
    prefix: '/',
    cacheControl: isProduction,
    etag: true,
    lastModified: true,
    maxAge: isProduction ? parseDurationToJustMs('1d') : 0,
  });

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

async function startServer(port: number) {
  const fastify = await createFastifyApp();

  logger.info('Starting server...');
  const dbConnected = await checkDatabaseConnection();

  if (!dbConnected) {
    logger.warn('Database connection failed, but continuing to start server');
  }

  try {
    await fastify.listen({ port, host: '127.0.0.1' });
    logger.info(`Environment: ${env.NODE_ENV}`);
    logger.info(`Frontend static files served from: ${frontendDistPath}`);
    logger.success(`Server is running on http://127.0.0.1:${port}`);

    return fastify;
  } catch (error) {
    logger.error('Server failed to start:', error);
    throw error;
  }
}

// Start the server and setup graceful shutdown
startServer(env.PORT)
  .then(fastify => {
    logger.success('Server started successfully');

    const gracefulShutdown = async (signal: string) => {
      logger.warn(`Received ${signal}: shutting down server gracefully...`);

      try {
        await fastify.close();
        logger.success('Server closed');

        await disconnectDatabase();
        logger.success('Database disconnected');
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        throw error;
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  })
  .catch(async error => {
    logger.error('Failed to start server:', error);
    throw error;
  });
