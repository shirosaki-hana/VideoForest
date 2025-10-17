import { type FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { getMasterPlaylistPath, getQualityPlaylistPath, getSegmentPath, stopStreaming } from '../services/index.js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { logger } from '../utils/index.js';
//------------------------------------------------------------------------------//

export const streamingRoutes: FastifyPluginAsync = async fastify => {
  fastify.addHook('preHandler', requireAuth);

  /**
   * HLS Master Playlist 제공 (ABR용)
   * GET /hls/:mediaId/master.m3u8
   * 
   * 여러 품질(variants)을 나열하는 Master Playlist를 반환합니다.
   * video.js는 이를 읽고 네트워크 상태에 따라 적절한 품질을 선택합니다.
   */
  fastify.get<{ Params: { mediaId: string } }>('/hls/:mediaId/master.m3u8', async (request, reply) => {
    const { mediaId } = request.params;

    try {
      const playlistPath = await getMasterPlaylistPath(mediaId);

      if (!playlistPath) {
        return reply.code(404).send({ error: 'Master playlist not found' });
      }

      const playlistContent = await fs.readFile(playlistPath, 'utf-8');

      return reply
        .code(200)
        .header('Content-Type', 'application/vnd.apple.mpegurl')
        .header('Cache-Control', 'no-cache')
        .send(playlistContent);
    } catch (error) {
      logger.error(`Failed to serve master playlist for ${mediaId}:`, error);
      return reply.code(500).send({ error: 'Failed to serve master playlist' });
    }
  });

  /**
   * 특정 품질의 Media Playlist 제공
   * GET /hls/:mediaId/v:quality/playlist.m3u8
   * 
   * 예: /hls/abc123/v0/playlist.m3u8 (1080p)
   *     /hls/abc123/v1/playlist.m3u8 (720p)
   *     /hls/abc123/v2/playlist.m3u8 (480p)
   *     /hls/abc123/v3/playlist.m3u8 (360p)
   */
  fastify.get<{ Params: { mediaId: string; quality: string } }>('/hls/:mediaId/v:quality/playlist.m3u8', async (request, reply) => {
    const { mediaId, quality } = request.params;

    // 품질 인덱스 검증
    const qualityIndex = parseInt(quality, 10);
    if (isNaN(qualityIndex) || qualityIndex < 0 || qualityIndex > 3) {
      return reply.code(400).send({ error: 'Invalid quality index' });
    }

    try {
      const playlistPath = getQualityPlaylistPath(mediaId, qualityIndex);

      // 소프트 대기: 최대 2초 동안 100ms 간격으로 생성 여부 확인
      let resolvedPath = playlistPath;
      const start = Date.now();
      while (resolvedPath && !existsSync(resolvedPath) && Date.now() - start < 2000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!resolvedPath || !existsSync(resolvedPath)) {
        logger.debug ? logger.debug(`Quality playlist not ready: ${mediaId}/v${qualityIndex}`) : logger.warn(`Quality playlist not found: ${mediaId}/v${qualityIndex}`);
        return reply.code(404).send({ error: 'Quality playlist not found' });
      }

      const playlistContent = await fs.readFile(resolvedPath, 'utf-8');

      return reply
        .code(200)
        .header('Content-Type', 'application/vnd.apple.mpegurl')
        .header('Cache-Control', 'no-cache')
        .send(playlistContent);
    } catch (error) {
      logger.error(`Failed to serve quality playlist for ${mediaId}/v${qualityIndex}:`, error);
      return reply.code(500).send({ error: 'Failed to serve quality playlist' });
    }
  });

  /**
   * HLS 세그먼트 파일 제공
   * GET /hls/:mediaId/v:quality/:segmentName
   * 
   * 예: /hls/abc123/v0/segment_000.ts
   */
  fastify.get<{ Params: { mediaId: string; quality: string; segmentName: string } }>(
    '/hls/:mediaId/v:quality/:segmentName',
    async (request, reply) => {
      const { mediaId, quality, segmentName } = request.params;

      // 세그먼트 파일명 검증 (보안)
      if (!/^segment_\d{3}\.ts$/.test(segmentName)) {
        return reply.code(400).send({ error: 'Invalid segment name' });
      }

      // 품질 인덱스 검증
      const qualityIndex = parseInt(quality, 10);
      if (isNaN(qualityIndex) || qualityIndex < 0 || qualityIndex > 3) {
        return reply.code(400).send({ error: 'Invalid quality index' });
      }

      try {
        const segmentPath = getSegmentPath(mediaId, qualityIndex, segmentName);

        if (!segmentPath) {
          logger.warn(`Session not found for media ${mediaId}, quality v${qualityIndex}, segment ${segmentName}`);
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
          .header('Cache-Control', 'public, max-age=31536000')
          .send(stream);
      } catch (error) {
        logger.error(`Failed to serve segment ${segmentName} for ${mediaId}/v${qualityIndex}:`, error);
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
};
