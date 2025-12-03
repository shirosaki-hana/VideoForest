import ansi from 'ansi-colors';
import { isDevelopment } from '../config/env.js';
import type { LogLevel, LogCategory } from '@videoforest/types';

//------------------------------------------------------------------------------//
// DB 저장 함수 (지연 로딩으로 순환 참조 방지)
let saveToDbFn: ((level: LogLevel, category: LogCategory, message: string, meta?: unknown) => Promise<void>) | null = null;

export const setLogDbSaver = (fn: typeof saveToDbFn) => {
  saveToDbFn = fn;
};

// 시간 포맷팅 함수
const getTimestamp = (): string => {
  const now = new Date();
  const time = now.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${date} ${time}`;
};

// 로그 레벨별 색상 및 배경 설정
const logLevels = {
  ERROR: { color: ansi.red, bg: ansi.bgRed },
  WARN: { color: ansi.yellow, bg: ansi.bgYellow },
  INFO: { color: ansi.cyan, bg: ansi.bgCyan },
  DEBUG: { color: ansi.magenta, bg: ansi.bgMagenta },
  SUCCESS: { color: ansi.green, bg: ansi.bgGreen }, // 콘솔 표시용 (DB에는 INFO로 저장)
} as const;

// 카테고리별 색상 설정
const categoryColors: Record<LogCategory, (str: string) => string> = {
  api: ansi.blue,
  streaming: ansi.green,
  media: ansi.yellow,
  auth: ansi.red,
  system: ansi.white,
  database: ansi.cyan,
};

// 유효한 카테고리인지 확인
const validCategories: LogCategory[] = ['api', 'streaming', 'media', 'auth', 'system', 'database'];
const isValidCategory = (value: unknown): value is LogCategory => {
  return typeof value === 'string' && validCategories.includes(value as LogCategory);
};

// 로그 메시지 포맷팅 및 출력 함수
const formatMessage = (level: keyof typeof logLevels, category: LogCategory, ...args: unknown[]): void => {
  const timestamp = getTimestamp();
  const { color, bg } = logLevels[level];

  const levelTag = bg(ansi.white.bold(` ${level} `));
  const categoryTag = categoryColors[category](`[${category}]`);
  const timeTag = ansi.dim(timestamp);
  const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))).join(' ');

  // eslint-disable-next-line no-console
  console.log(`${levelTag} ${categoryTag} ${timeTag} ${color(message)}`);
};

// DB에 비동기 저장 (실패해도 무시)
const saveToDb = async (level: LogLevel, category: LogCategory, message: string, meta?: unknown): Promise<void> => {
  if (!saveToDbFn) {
    return;
  }
  
  try {
    await saveToDbFn(level, category, message, meta);
  } catch {
    // DB 저장 실패는 무시 (콘솔 로그는 이미 출력됨)
  }
};

// 메시지와 메타데이터 분리
const extractMeta = (args: unknown[]): { message: string; meta?: unknown } => {
  if (args.length === 0) {
    return { message: '' };
  }
  
  const lastArg = args[args.length - 1];
  
  // 마지막 인자가 객체이고 첫 번째 인자가 문자열이면 메타데이터로 간주
  if (args.length >= 2 && typeof args[0] === 'string' && typeof lastArg === 'object' && lastArg !== null) {
    const messageArgs = args.slice(0, -1);
    return {
      message: messageArgs.map(arg => String(arg)).join(' '),
      meta: lastArg,
    };
  }
  
  return {
    message: args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' '),
  };
};

// 로거 함수 생성 (카테고리 선택적)
const createLogFn = (level: LogLevel, consoleLevel: keyof typeof logLevels = level) => 
  (categoryOrMessage: LogCategory | unknown, ...args: unknown[]) => {
    // DEBUG는 개발 환경에서만 출력
    if (level === 'DEBUG' && !isDevelopment) {
      return;
    }
    
    let category: LogCategory;
    let logArgs: unknown[];
    
    // 첫 번째 인자가 유효한 카테고리인지 확인
    if (isValidCategory(categoryOrMessage)) {
      category = categoryOrMessage;
      logArgs = args;
    } else {
      // 카테고리가 없으면 'system' 사용
      category = 'system';
      logArgs = [categoryOrMessage, ...args];
    }
    
    formatMessage(consoleLevel, category, ...logArgs);
    
    const { message, meta } = extractMeta(logArgs);
    void saveToDb(level, category, message, meta);
  };

export const logger = {
  error: createLogFn('ERROR'),
  warn: createLogFn('WARN'),
  info: createLogFn('INFO'),
  debug: createLogFn('DEBUG'),
  success: createLogFn('INFO', 'SUCCESS'), // DB에는 INFO로 저장, 콘솔에는 SUCCESS 스타일
};
