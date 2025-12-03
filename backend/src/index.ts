import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import apiRoutes from './api/index.js';
import { HardwareAccelerationDetector, FFmpegTranscoder } from './infrastructure/index.js';
import { detectFFmpeg, detectFFprobe } from './utils/index.js';
import { env, fastifyConfig, helmetConfig, rateLimitConfig, corsConfig, staticFilesConfig } from './config/index.js';
import { checkDatabaseConnection, disconnectDatabase } from './database/index.js';
import { notFoundHandler, errorHandler } from './handlers/index.js';
import { initializeLogger } from './services/logs.js';
//------------------------------------------------------------------------------//

// Fastify 서버 생성
async function createFastifyApp() {
  const fastify = Fastify(fastifyConfig);
  //서버 초기 설정
  await fastify.register(helmet, helmetConfig); // 1. 보안 헤더 설정
  await fastify.register(rateLimit, rateLimitConfig); // 2. Rate Limit 설정
  await fastify.register(compress); // 3. 압축 설정
  await fastify.register(cors, corsConfig); // 4. CORS 정책 설정
  await fastify.register(cookie); // 5. Cookie 설정
  await fastify.register(apiRoutes, { prefix: '/api' }); // 6. API 라우트 등록
  await fastify.register(staticFiles, staticFilesConfig); // 7. 정적 파일 서빙
  //핸들러 등록
  fastify.setNotFoundHandler(notFoundHandler); // SPA fallback 및 404 핸들러
  fastify.setErrorHandler(errorHandler); // 전역 에러 핸들러

  return fastify;
}

// 서버 시작 함수
async function startServer(host: string, port: number) {
  //앱 초기 동작 (Fastify 생성 전)
  await checkDatabaseConnection(); // 1. 데이터베이스 커넥션 확인
  initializeLogger(); // 2. 로거 초기화 (Fastify 로거가 사용하므로 먼저 초기화)
  //Fastify 앱 생성
  const fastify = await createFastifyApp(); // 3. Fastify 앱 생성 (로거 스트림 사용)
  //앱 초기 동작 (Fastify 생성 후)
  await detectFFmpeg(); // 4. FFmpeg 감지
  await detectFFprobe(); // 5. FFprobe 감지
  await HardwareAccelerationDetector.detect(); // 6. 하드웨어 가속 감지
  await fastify.listen({ port, host: host }); // 7. 서버 리스닝 시작

  return fastify;
}

// Graceful shutdown 핸들러
async function gracefulShutdown(fastify: Awaited<ReturnType<typeof createFastifyApp>>) {
  try {
    FFmpegTranscoder.killAllProcesses(); // 1. 활성 FFmpeg 프로세스 종료 (고아 프로세스 방지)
    await fastify.close(); // 2. Fastify 서버 종료
    await disconnectDatabase(); // 3. 데이터베이스 연결 해제
    process.exitCode = 0;
  } catch {
    process.exitCode = 1;
  }
}

// 메인 엔트리 포인트
async function main() {
  try {
    const fastify = await startServer(env.HOST, env.PORT);
    process.on('SIGINT', () => {
      gracefulShutdown(fastify).catch(() => {}); // SIGINT로 인한 서버 종료
    });
    process.on('SIGTERM', () => {
      gracefulShutdown(fastify).catch(() => {}); // SIGTERM으로 인한 서버 종료
    });
  } catch {
    process.exitCode = 1;
  }
}

// 서버 시작
main();
