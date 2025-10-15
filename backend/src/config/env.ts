import dotenv from 'dotenv';
import { z } from 'zod';
import { logger } from '../utils/log.js';
//------------------------------------------------------------------------------//
dotenv.config({ quiet: true });

//환경 변수 Zod 스키마
const envSchema = z.object({
  HOST: z.string().default('127.0.0.1').describe('Server listening host'),
  PORT: z
    .string()
    .default('4001')
    .transform(val => {
      const port = parseInt(val, 10);
      if (isNaN(port) || port <= 0 || port > 65535) {
        logger.warn(`Invalid PORT value: ${val}, using default 4001`);
        return 4001;
      }
      return port;
    }),

  NODE_ENV: z.enum(['production', 'development']).default('development').describe('Application environment'),
  REQUEST_BODY_LIMIT: z.string().default('50mb').describe('Maximum request body size'),
  FRONTEND_URL: z
    .string()
    .default('http://127.0.0.1')
    .refine(
      url => {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Must be a valid URL' }
    )
    .describe('Frontend application URL'),

  // === 데이터베이스 ===
  DATABASE_URL_SQLITE: z.string().default('file:./prisma/videoforest.db').describe('SQLite database URL'),

  // === 인증 관련 ===
  SESSION_COOKIE: z.string().default('nf_session').describe('Session cookie name'),
  SESSION_TTL: z
    .string()
    .default('86400000')
    .transform(val => {
      const ttl = parseInt(val, 10);
      if (isNaN(ttl) || ttl <= 0) {
        logger.warn(`Invalid SESSION_TTL value: ${val}, using default 86400000`);
        return 86400000;
      }
      return ttl;
    })
    .describe('Session TTL in milliseconds'),
  LOGIN_WINDOWMS: z.string().default('900000').describe('Login rate limit window in milliseconds'),
  LOGIN_MAX: z
    .string()
    .default('5')
    .transform(val => {
      const max = parseInt(val, 10);
      if (isNaN(max) || max <= 0) {
        logger.warn(`Invalid LOGIN_MAX value: ${val}, using default 5`);
        return 5;
      }
      return max;
    })
    .describe('Maximum login attempts per window'),
});

//환경변수 파싱 및 검증
function parseEnvironmentVariables() {

    const rawEnv = {
      HOST: process.env.HOST,
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      REQUEST_BODY_LIMIT: process.env.REQUEST_BODY_LIMIT,
      FRONTEND_URL: process.env.FRONTEND_URL,
      DATABASE_URL_SQLITE: process.env.DATABASE_URL_SQLITE,
      SESSION_COOKIE: process.env.SESSION_COOKIE,
      SESSION_TTL: process.env.SESSION_TTL,
      LOGIN_WINDOWMS: process.env.LOGIN_WINDOWMS,
      LOGIN_MAX: process.env.LOGIN_MAX,
    };

    const result = envSchema.safeParse(rawEnv);

    if (!result.success) {
      logger.warn('Environment validation failed, using default values:');
      result.error.issues.forEach(issue => {
        logger.warn(`${issue.path.join('.')}: ${issue.message}`);
      });
      
      // 검증 실패 시에도 default 값으로 재시도
      const defaultEnv = envSchema.parse({});
      return defaultEnv;
    }

    logger.success('Environment variables loaded successfully');
    return result.data;
}

// 환경변수를 파싱하여 export
export const env = parseEnvironmentVariables();

// 타입 export (다른 파일에서 타입 힌트용)
export type Environment = z.infer<typeof envSchema>;

// 유틸리티 함수들
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
