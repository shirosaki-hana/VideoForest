import dotenv from 'dotenv';
import { z } from 'zod';
import ms from 'ms';
//------------------------------------------------------------------------------//
dotenv.config({ quiet: true });

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
  RATELIMIT_MAX: z.coerce.number().positive().default(10),
  RATELIMIT_WINDOWMS: msStringSchema.default('10s'),
});

// 출력
export const env = envSchema.parse(process.env);
export type Environment = z.infer<typeof envSchema>;

// 유틸리티 함수
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
