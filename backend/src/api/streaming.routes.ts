import { type FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import {
  getPlaylistPath,
  getSegmentPath,
  stopStreaming,
  getSessionInfo,
  getFailures,
  clearFailure,
} from '../services/index.js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { logger } from '../utils/index.js';
//------------------------------------------------------------------------------//

export const streamingRoutes: FastifyPluginAsync = async fastify => {
  fastify.addHook('preHandler', requireAuth);

  /**
   * HLS Playlist 제공 (단일 품질)
   * GET /hls/:mediaId/playlist.m3u8
   * 
   * ABR 제거 - 단순화된 단일 품질 스트리밍
   */
  fastify.get<{ Params: { mediaId: string } }>('/hls/:mediaId/playlist.m3u8', async (request, reply) => {
    const { mediaId } = request.params;

    try {
      // 자동 시작 (세션 없으면 생성)
      const playlistPath = await getPlaylistPath(mediaId);

      if (!playlistPath) {
        // 트랜스코딩 실패 - 명확한 에러 메시지
        const failures = getFailures();
        const failure = failures.find(f => f.mediaId === mediaId);

        if (failure) {
          logger.error(`Playlist request failed for ${mediaId}: ${failure.error}`);
          return reply.code(500).send({
            error: 'Transcoding failed',
            message: failure.error,
            details: failure.analysis?.compatibilityIssues || [],
            attemptCount: failure.attemptCount,
          });
        }

        return reply.code(404).send({ error: 'Playlist not found' });
      }

      // 플레이리스트 파일 대기 (최대 2초)
      let resolved = playlistPath;
      const start = Date.now();
      while (!existsSync(resolved) && Date.now() - start < 2000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!existsSync(resolved)) {
        logger.warn(`Playlist file not ready yet: ${mediaId}`);
        return reply.code(202).send({
          message: 'Transcoding in progress, please retry',
        });
      }

      const playlistContent = await fs.readFile(resolved, 'utf-8');

      return reply
        .code(200)
        .header('Content-Type', 'application/vnd.apple.mpegurl')
        .header('Cache-Control', 'no-cache')
        .send(playlistContent);
    } catch (error) {
      logger.error(`Failed to serve playlist for ${mediaId}:`, error);
      return reply.code(500).send({ error: 'Failed to serve playlist' });
    }
  });

  /**
   * HLS 세그먼트 파일 제공
   * GET /hls/:mediaId/:segmentName
   * 
   * 예: /hls/abc123/segment_000.ts
   */
  fastify.get<{ Params: { mediaId: string; segmentName: string } }>(
    '/hls/:mediaId/:segmentName',
    async (request, reply) => {
      const { mediaId, segmentName } = request.params;

      // 세그먼트 파일명 검증 (보안)
      if (!/^segment_\d{3}\.ts$/.test(segmentName)) {
        return reply.code(400).send({ error: 'Invalid segment name' });
      }

      try {
        const segmentPath = getSegmentPath(mediaId, segmentName);

        if (!segmentPath) {
          logger.warn(`Session not found for media ${mediaId}, segment ${segmentName}`);
          return reply.code(404).send({ error: 'Session not found' });
        }

        if (!existsSync(segmentPath)) {
          logger.warn(`Segment file not found: ${segmentPath}`);
          return reply.code(404).send({ error: 'Segment file not found' });
        }

        // 세그먼트 파일 스트림으로 전송
        const stream = (await import('fs')).createReadStream(segmentPath);

        return reply
          .code(200)
          .header('Content-Type', 'video/mp2t')
          .header('Cache-Control', 'public, max-age=31536000')  // 1년 캐시
          .send(stream);
      } catch (error) {
        logger.error(`Failed to serve segment ${segmentName} for ${mediaId}:`, error);
        return reply.code(500).send({ error: 'Failed to serve segment' });
      }
    }
  );

  /**
   * 미디어 정보 조회 (재생용)
   * GET /media/:mediaId
   */
  fastify.get<{ Params: { mediaId: string } }>('/media/:mediaId', async (request, reply) => {
    const { mediaId } = request.params;

    try {
      const { database } = await import('../database/index.js');
      const media = await database.media.findUnique({
        where: { id: mediaId },
      });

      if (!media) {
        return reply.code(404).send({ error: 'Media not found' });
      }

      return reply.code(200).send({
        success: true,
        media: {
          id: media.id,
          name: media.name,
          duration: media.duration,
          width: media.width,
          height: media.height,
          codec: media.codec,
          bitrate: media.bitrate,
          fps: media.fps,
          audioCodec: media.audioCodec,
          fileSize: media.fileSize,
        },
      });
    } catch (error) {
      logger.error(`Failed to get media info for ${mediaId}:`, error);
      return reply.code(500).send({ error: 'Failed to get media info' });
    }
  });

  /**
   * 세션 정보 조회 (디버깅용)
   * GET /hls/:mediaId/session
   */
  fastify.get<{ Params: { mediaId: string } }>('/hls/:mediaId/session', async (request, reply) => {
    const { mediaId } = request.params;

    try {
      const session = getSessionInfo(mediaId);

      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      return reply.code(200).send({
        success: true,
        session: {
          mediaId: session.mediaId,
          profile: session.profile,
          analysis: session.analysis,
          lastAccess: new Date(session.lastAccess),
          outputDir: session.outputDir,
        },
      });
    } catch (error) {
      logger.error(`Failed to get session info for ${mediaId}:`, error);
      return reply.code(500).send({ error: 'Failed to get session info' });
    }
  });

  /**
   * 스트리밍 세션 종료
   * DELETE /hls/:mediaId
   */
  fastify.delete<{ Params: { mediaId: string } }>('/hls/:mediaId', async (request, reply) => {
    const { mediaId } = request.params;

    try {
      await stopStreaming(mediaId);

      return reply.code(200).send({
        success: true,
        message: 'Streaming session stopped',
      });
    } catch (error) {
      logger.error(`Failed to stop streaming for ${mediaId}:`, error);
      return reply.code(500).send({ error: 'Failed to stop streaming' });
    }
  });

  /**
   * 실패 기록 조회 (디버깅용)
   * GET /hls/failures
   */
  fastify.get('/hls/failures', async (request, reply) => {
    try {
      const failures = getFailures();

      return reply.code(200).send({
        success: true,
        failures: failures.map(f => ({
          mediaId: f.mediaId,
          error: f.error,
          attemptCount: f.attemptCount,
          timestamp: new Date(f.timestamp),
          compatibilityIssues: f.analysis?.compatibilityIssues || [],
        })),
      });
    } catch (error) {
      logger.error('Failed to get failures:', error);
      return reply.code(500).send({ error: 'Failed to get failures' });
    }
  });

  /**
   * 실패 기록 초기화 (수동 재시도)
   * POST /hls/:mediaId/retry
   */
  fastify.post<{ Params: { mediaId: string } }>('/hls/:mediaId/retry', async (request, reply) => {
    const { mediaId } = request.params;

    try {
      clearFailure(mediaId);

      return reply.code(200).send({
        success: true,
        message: 'Failure record cleared, you can retry now',
      });
    } catch (error) {
      logger.error(`Failed to clear failure for ${mediaId}:`, error);
      return reply.code(500).send({ error: 'Failed to clear failure' });
    }
  });
};
