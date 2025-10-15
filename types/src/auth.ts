import { z } from 'zod';

// 단일 사용자 비밀번호 설정/로그인 공용 스키마
export const PasswordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^(?=.*[a-zA-Z])(?=.*\d).+$/, '비밀번호는 영문과 숫자를 포함해야 합니다.');

export const SessionTokenSchema = z.string().min(16).max(256);

// 최초 설정 요청
export const SetupPasswordRequestSchema = z.object({
  password: PasswordSchema,
});
export type SetupPasswordRequest = z.infer<typeof SetupPasswordRequestSchema>;

export const SetupPasswordResponseSchema = z.object({
  success: z.literal(true),
});
export type SetupPasswordResponse = z.infer<typeof SetupPasswordResponseSchema>;

// 로그인 요청/응답
export const LoginRequestSchema = z.object({
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  success: z.literal(true),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// 로그아웃 응답
export const LogoutResponseSchema = z.object({ success: z.literal(true) });
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

// 상태 조회
export const AuthStatusResponseSchema = z.object({
  isSetup: z.boolean(),
  isAuthenticated: z.boolean(),
});
export type AuthStatusResponse = z.infer<typeof AuthStatusResponseSchema>;

// 보호된 테스트 응답
export const ProtectedPingResponseSchema = z.object({ pong: z.literal(true) });
export type ProtectedPingResponse = z.infer<typeof ProtectedPingResponseSchema>;
