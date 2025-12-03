import type { LogLevel, LogCategory } from '@videoforest/types';

//------------------------------------------------------------------------------//
// DB 저장 함수 (지연 로딩으로 순환 참조 방지)
let saveToDbFn: ((level: LogLevel, category: LogCategory, message: string, meta?: unknown) => Promise<void>) | null = null;

export const setLogDbSaver = (fn: typeof saveToDbFn) => {
  saveToDbFn = fn;
};

// 단순한 로그 함수 - 명시적 API
const log = (level: LogLevel, category: LogCategory, message: string, meta?: unknown): void => {
  if (saveToDbFn) {
    saveToDbFn(level, category, message, meta).catch(() => {});
  }
};

export const logger = {
  error: (category: LogCategory, message: string, meta?: unknown) => log('ERROR', category, message, meta),
  warn: (category: LogCategory, message: string, meta?: unknown) => log('WARN', category, message, meta),
  info: (category: LogCategory, message: string, meta?: unknown) => log('INFO', category, message, meta),
  debug: (category: LogCategory, message: string, meta?: unknown) => log('DEBUG', category, message, meta),
};
