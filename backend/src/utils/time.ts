import { z } from 'zod';

/**
 * 사람이 읽기 쉬운 시간 표현을 파싱하는 유틸리티
 * 지원 형식: "900000", "15m", "24h", "7d", "1w", "900s", "7 * 24 * 60 * 60"
 */

// 지원되는 시간 단위
const TimeUnit = z.enum(['ms', 's', 'm', 'h', 'd', 'w']);
type TimeUnit = z.infer<typeof TimeUnit>;

// 타입 정의 (입력 검증은 Zod로 처리)
export type Milliseconds = number;
export type Seconds = number;

// 시간 단위별 밀리초 변환 상수
const UNIT_TO_MS: Record<TimeUnit, number> = {
  ms: 1,
  s: 1_000,
  m: 60 * 1_000,
  h: 60 * 60 * 1_000,
  d: 24 * 60 * 60 * 1_000,
  w: 7 * 24 * 60 * 60 * 1_000,
} as const;

// 입력값 검증을 위한 Zod 스키마
const DurationInput = z.union([z.number().min(0), z.string().min(1)]);

const TimeExpressionSchema = z.string().regex(/^([0-9.\s*]+)\s*(ms|s|m|h|d|w)?$/i, 'Invalid time expression format');

/**
 * 안전한 값 변환 헬퍼
 */
export function asMs(value: number): Milliseconds {
  return Math.max(0, Math.floor(value));
}

export function asSeconds(value: number): Seconds {
  return Math.max(0, Math.floor(value));
}

export function msToSeconds(ms: Milliseconds): Seconds {
  return asSeconds(ms / 1000);
}

export function secondsToMs(seconds: Seconds): Milliseconds {
  return asMs(seconds * 1000);
}

/**
 * 곱셈 표현식 파싱 (예: "7 * 24 * 60 * 60")
 */
function parseMultiplicationExpression(expression: string): number {
  return expression
    .split('*')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const value = Number(part);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number in expression: ${part}`);
      }
      return value;
    })
    .reduce((acc, val) => acc * val, 1);
}

/**
 * 시간 표현식 파싱
 */
function parseTimeExpression(input: string): { value: number; unit?: TimeUnit } {
  const validated = TimeExpressionSchema.parse(input.trim().toLowerCase());
  const match = validated.match(/^([0-9.\s*]+)\s*(ms|s|m|h|d|w)?$/i);

  if (!match) {
    throw new Error('Invalid time expression');
  }

  const [, expression, unitStr] = match;
  const unit = unitStr ? TimeUnit.parse(unitStr) : undefined;

  let value: number;
  if (expression.includes('*')) {
    value = parseMultiplicationExpression(expression);
  } else {
    value = Number(expression.trim());
    if (!Number.isFinite(value)) {
      throw new Error('Invalid number in time expression');
    }
  }

  return { value, unit };
}

/**
 * 통합된 시간 파싱 함수
 */
export function parseDuration(input: unknown): Milliseconds | null {
  try {
    const validated = DurationInput.parse(input);

    if (typeof validated === 'number') {
      return asMs(validated);
    }

    const { value, unit } = parseTimeExpression(validated);
    const multiplier = unit ? UNIT_TO_MS[unit] : 1; // 기본값은 밀리초
    const result = value * multiplier;

    return Number.isFinite(result) && result >= 0 ? asMs(result) : null;
  } catch {
    return null;
  }
}

/**
 * 사용자 친화적 API 함수들
 */
export function parseDurationToMs(input: unknown, defaultMs: Milliseconds): Milliseconds {
  const result = parseDuration(input);
  return result ?? defaultMs;
}

export function parseDurationToJustMs(input: unknown): number {
  const result = parseDuration(input);
  return result ?? 0;
}

export function parseDurationToSeconds(input: unknown, defaultSeconds: Seconds): Seconds {
  const result = parseDuration(input);
  if (result === null) {
    return defaultSeconds;
  }
  return msToSeconds(result);
}
