import { type FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { getPlaylistPath, getSegmentPath } from '../services/index.js';
import fs from 'fs/promises';
import { logger } from '../utils/index.js';
//------------------------------------------------------------------------------//

export const streamingRoutes: FastifyPluginAsync = async fastify => {
  fastify.addHook('preHandler', requireAuth);

  // HLS 마스터 플레이리스트 제공
  fastify.get<{ Params: { mediaId: string } }>('/hls/:mediaId/playlist.m3u8', async (request, reply) => {
    const { mediaId } = request.params;

    try {
      const playlistPath = await getPlaylistPath(mediaId);

      if (!playlistPath) {
        return reply.code(404).send({ error: 'Playlist not found' });
      }

      // 플레이리스트 파일 읽기
      const playlistContent = await fs.readFile(playlistPath, 'utf-8');

      // HLS 플레이리스트 응답
      return reply
        .code(200)
        .header('Content-Type', 'application/vnd.apple.mpegurl')
        .header('Cache-Control', 'no-cache')
        .send(playlistContent);
    } catch (error: any) {
      logger.error(`Failed to serve playlist for ${mediaId}:`, error);
      return reply.code(500).send({ error: 'Failed to serve playlist' });
    }
  });

  // HLS 세그먼트 파일 제공
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
          return reply.code(404).send({ error: 'Segment not found' });
        }

        // 세그먼트 파일 스트림으로 전송
        const stream = (await import('fs')).createReadStream(segmentPath);

        return reply
          .code(200)
          .header('Content-Type', 'video/mp2t')
          .header('Cache-Control', 'public, max-age=31536000')
          .send(stream);
      } catch (error: any) {
        logger.error(`Failed to serve segment ${segmentName} for ${mediaId}:`, error);
        return reply.code(500).send({ error: 'Failed to serve segment' });
      }
    }
  );

  // 미디어 정보 조회 (재생용)
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
    } catch (error: any) {
      logger.error(`Failed to get media info for ${mediaId}:`, error);
      return reply.code(500).send({ error: 'Failed to get media info' });
    }
  });
};

