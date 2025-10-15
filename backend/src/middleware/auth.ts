import { type FastifyRequest, type FastifyReply } from 'fastify';
import { env } from '../config/index.js';
import { authenticateByToken } from '../services/auth.js';

/**
 * 세션 인증 미들웨어
 * 쿠키에서 세션 토큰을 확인하고 유효하지 않으면 401 응답
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies?.[env.SESSION_COOKIE];
  const isAuthenticated = await authenticateByToken(token);

  if (!isAuthenticated) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}
