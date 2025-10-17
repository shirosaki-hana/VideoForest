import dotenv from 'dotenv';
import { z } from 'zod';
//------------------------------------------------------------------------------//
dotenv.config({ quiet: true });

// 환경 변수 Zod 스키마
const envSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().min(1).max(65535).default(4001),
  NODE_ENV: z.enum(['production', 'development']).default('development'),
  REQUEST_BODY_LIMIT: z.string().default('3mb'),
  FRONTEND_URL: z.url().default('http://127.0.0.1'),
  DATABASE_URL_SQLITE: z.string().default('file:./prisma/videoforest.db'),
  SESSION_COOKIE: z.string().default('session'),
  SESSION_TTL: z.string().default('24h'),
  RATELIMIT_MAX: z.coerce.number().positive().default(10),
  RATELIMIT_WINDOWMS: z.string().default('10s'),
});

// 출력
export const env = envSchema.parse(process.env);
export type Environment = z.infer<typeof envSchema>;

// 유틸리티 함수
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
