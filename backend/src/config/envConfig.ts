import { z } from 'zod';
import { logger } from '../utils/log.js';

/**
 * 환경변수 스키마 정의
 * 모든 환경변수는 여기서 타입 검증과 기본값 설정을 담당합니다.
 */
const envSchema = z.object({
  // === 서버 관련 ===
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

  NODE_ENV: z.enum(['production', 'development', 'test']).default('development').describe('Application environment'),

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

  // === 인증 관련 ===
  SESSION_COOKIE: z.string().default('nf_session').describe('Session cookie name'),

  SESSION_TTL: z.string().default('86400000').describe('Session TTL in milliseconds'),

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

/**
 * 환경변수 파싱 및 검증
 * 애플리케이션 시작 시 한 번 실행되어 환경변수를 안전하게 파싱합니다.
 */
function parseEnvironmentVariables() {
  try {
    const rawEnv = {
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      REQUEST_BODY_LIMIT: process.env.REQUEST_BODY_LIMIT,
      FRONTEND_URL: process.env.FRONTEND_URL,
      SESSION_COOKIE: process.env.SESSION_COOKIE,
      SESSION_TTL: process.env.SESSION_TTL,
      LOGIN_WINDOWMS: process.env.LOGIN_WINDOWMS,
      LOGIN_MAX: process.env.LOGIN_MAX,
    };

    const parsed = envSchema.parse(rawEnv);
    logger.success('Environment variables loaded successfully');

    return parsed;
  } catch (error) {
    logger.error('Failed to parse environment variables:');
    if (error instanceof z.ZodError) {
      error.issues.forEach(issue => {
        logger.error(`- ${issue.path.join('.')}: ${issue.message}`);
      });
    } else {
      logger.error(error);
    }
    throw new Error('Environment variable validation failed');
  }
}

// 환경변수를 파싱하여 export
export const env = parseEnvironmentVariables();

// 타입 export (다른 파일에서 타입 힌트용)
export type Environment = z.infer<typeof envSchema>;

// 유틸리티 함수들
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

/**
 * 런타임에 특정 환경변수가 설정되었는지 확인하는 유틸리티
 */
export function hasEnvVar(key: keyof Environment): boolean {
  return process.env[key] !== undefined;
}

/**
 * 개발 환경에서만 사용할 수 있는 환경변수 getter
 * production에서는 빈 문자열을 반환
 */
export function getDevEnvVar(key: string, fallback = ''): string {
  if (isProduction) {
    return fallback;
  }
  return process.env[key] || fallback;
}
