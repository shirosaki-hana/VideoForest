import dotenv from 'dotenv';
import { z } from 'zod';
import ms from 'ms';
import path from 'path';
import { backendRoot, projectRoot } from '../utils/dir.js';
//------------------------------------------------------------------------------//
dotenv.config({ path: path.resolve(backendRoot, '.env'), quiet: true });
dotenv.config({ path: path.resolve(projectRoot, '.env'), quiet: true });

// ms 라이브러리 형식의 시간 문자열을 검증하는 Zod 스키마
const msStringSchema = z
  .string()
  .refine(
    val => {
      try {
        const result = ms(val as ms.StringValue);
        return typeof result === 'number' && !isNaN(result);
      } catch {
        return false;
      }
    },
    { message: 'Invalid time format (e.g., "24h", "10s", "7d")' }
  )
  .transform(val => val as ms.StringValue);

// 환경 변수 Zod 스키마
const envSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().min(1).max(65535).default(4001),
  NODE_ENV: z.enum(['production', 'development']).default('development'),
  REQUEST_BODY_LIMIT: z.string().default('3mb'),
  FRONTEND_URL: z.url().default('http://127.0.0.1'),
  DATABASE_URL_SQLITE: z.string().default('file:./prisma/videoforest.db'),
  SESSION_COOKIE: z.string().default('session'),
  SESSION_TTL: msStringSchema.default('24h'),
  RATELIMIT_MAX: z.coerce.number().positive().default(100),
  RATELIMIT_WINDOWMS: msStringSchema.default('10s'),
  MEDIA_PATHS: z
    .string()
    .default('./media')
    .transform(val =>
      val
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0)
    )
    .pipe(z.array(z.string()).min(1)),
  // 속도 모드 토글: '1' | '0' | 'true' | 'false'
  VIDEOFOREST_SPEED_MODE: z
    .string()
    .default('0')
    .transform(v => v === '1' || v.toLowerCase() === 'true'),
  // HLS 세그먼트 저장 경로
  HLS_TEMP_DIR: z.string().default('temp/hls'),
  // 트랜스코딩 하드웨어 선택: Auto | NVENC | QSV | CPU (대소문자 무시)
  VIDEOFOREST_ENCODER: z
    .string()
    .default('Auto')
    .transform(v => {
      const norm = v.trim().toLowerCase();
      if (norm === 'auto') {
        return 'auto' as const;
      }
      if (norm === 'nvenc') {
        return 'nvenc' as const;
      }
      if (norm === 'qsv') {
        return 'qsv' as const;
      }
      if (norm === 'cpu') {
        return 'cpu' as const;
      }
      // 알 수 없는 값은 Auto로 강제
      return 'auto' as const;
    }),
});

// 출력
export const env = envSchema.parse(process.env);
export type Environment = z.infer<typeof envSchema>;

// 유틸리티 함수
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
