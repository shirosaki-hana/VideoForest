import { type FastifyPluginAsync } from 'fastify';
import {
  AuthStatusResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  LogoutResponseSchema,
  SetupPasswordRequestSchema,
  SetupPasswordResponseSchema,
} from '@videoforest/types';
import { env } from '../config/index.js';
import { authenticateByToken, getCookieOptions, isPasswordSetup, login, logoutByToken, setupPassword } from '../services/auth.js';

/**
 * 인증 관련 라우트
 * - /auth/status - 설정 완료 여부 및 인증 상태 조회
 * - /auth/setup - 최초 비밀번호 설정
 * - /auth/login - 로그인 (세션 발급)
 * - /auth/logout - 로그아웃 (세션 삭제)
 */
export const authRoutes: FastifyPluginAsync = async fastify => {
  // 상태 조회: 최초 설정 여부, 인증 여부
  fastify.get('/status', async (request, reply) => {
    const token = request.cookies?.[env.SESSION_COOKIE];
    const [setup, authed] = await Promise.all([isPasswordSetup(), authenticateByToken(token)]);
    const body = { isSetup: setup, isAuthenticated: authed };
    return reply.send(AuthStatusResponseSchema.parse(body));
  });

  // 최초 비밀번호 설정
  fastify.post('/setup', async (request, reply) => {
    const { password } = SetupPasswordRequestSchema.parse(request.body);
    await setupPassword({ password });
    return reply.send(SetupPasswordResponseSchema.parse({ success: true }));
  });

  // 로그인: 세션 발급 + 쿠키 설정
  fastify.post('/login', async (request, reply) => {
    const { password } = LoginRequestSchema.parse(request.body);
    const token = await login({ password });
    reply.setCookie(env.SESSION_COOKIE, token, getCookieOptions());
    return reply.send(LoginResponseSchema.parse({ success: true }));
  });

  // 로그아웃: 세션 제거 + 쿠키 삭제
  fastify.post('/logout', async (request, reply) => {
    const token = request.cookies?.[env.SESSION_COOKIE];
    if (token) {
      await logoutByToken(token);
    }
    reply.clearCookie(env.SESSION_COOKIE, getCookieOptions());
    return reply.send(LogoutResponseSchema.parse({ success: true }));
  });
};
