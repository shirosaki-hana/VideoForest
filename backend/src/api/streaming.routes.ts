import { type FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { getMasterPlaylistPath, getQualityPlaylistPath, getSegment } from '../services/index.js';
import fs from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import { logger } from '../utils/index.js';
//------------------------------------------------------------------------------//
// JIT 트랜스코딩 + 영구 캐싱 API
//
// 핵심 변경사항:
// - 세그먼트 요청 시 자동으로 JIT 트랜스코딩
// - 세션 관리 제거 (복잡도 감소)
// - 캐시는 영구 보관 (사용자가 수동 정리)
//------------------------------------------------------------------------------//

export const streamingRoutes: FastifyPluginAsync = async fastify => {
  fastify.addHook('preHandler', requireAuth);

  /**
   * HLS Master Playlist 제공 (ABR)
   * GET /hls/:mediaId/master.m3u8
   *
   * 모든 사용 가능한 품질을 나열하는 마스터 플레이리스트
   * 자동으로 초기화 및 구라 플레이리스트 생성
   */
  fastify.get<{ Params: { mediaId: string } }>('/hls/:mediaId/master.m3u8', async (request, reply) => {
    const { mediaId } = request.params;

    try {
      // 자동 초기화 (메타데이터 캐시 및 플레이리스트 생성)
      const masterPlaylistPath = await getMasterPlaylistPath(mediaId);

      if (!masterPlaylistPath) {
        logger.error('streaming', `Failed to initialize streaming for ${mediaId}`);
        return reply.code(500).send({
          error: 'Streaming initialization failed',
          message: 'Failed to analyze media or create playlists',
        });
      }

      // 파일이 없으면 잠깐 대기 (초기화 직후)
      if (!existsSync(masterPlaylistPath)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!existsSync(masterPlaylistPath)) {
        logger.error('streaming', `Master playlist file not found: ${masterPlaylistPath}`);
        return reply.code(500).send({
          error: 'Master playlist file not found',
        });
      }

      const playlistContent = await fs.readFile(masterPlaylistPath, 'utf-8');

      return reply
        .code(200)
        .header('Content-Type', 'application/vnd.apple.mpegurl')
        .header('Cache-Control', 'public, max-age=3600') // 1시간 캐시 (변하지 않음)
        .send(playlistContent);
    } catch (error) {
      logger.error('streaming', `Failed to serve master playlist for ${mediaId}:`, error);
      return reply.code(500).send({ error: 'Failed to serve master playlist' });
    }
  });

  /**
   * HLS Variant Playlist 제공 (특정 품질)
   * GET /hls/:mediaId/:quality/playlist.m3u8
   *
   * 화질별 플레이리스트 (구라 플레이리스트 - 모든 세그먼트 나열)
   */
  fastify.get<{ Params: { mediaId: string; quality: string } }>('/hls/:mediaId/:quality/playlist.m3u8', async (request, reply) => {
    const { mediaId, quality } = request.params;

    try {
      const playlistPath = await getQualityPlaylistPath(mediaId, quality);

      if (!playlistPath) {
        logger.error('streaming', `Failed to get quality playlist for ${quality} / ${mediaId}`);
        return reply.code(404).send({ error: 'Quality not available' });
      }

      // 파일이 없으면 잠깐 대기
      if (!existsSync(playlistPath)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!existsSync(playlistPath)) {
        logger.error('streaming', `Quality playlist file not found: ${playlistPath}`);
        return reply.code(500).send({ error: 'Playlist file not found' });
      }

      const playlistContent = await fs.readFile(playlistPath, 'utf-8');

      return reply
        .code(200)
        .header('Content-Type', 'application/vnd.apple.mpegurl')
        .header('Cache-Control', 'public, max-age=3600') // 1시간 캐시 (변하지 않음)
        .send(playlistContent);
    } catch (error) {
      logger.error('streaming', `Failed to serve quality playlist ${quality} for ${mediaId}:`, error);
      return reply.code(500).send({ error: 'Failed to serve quality playlist' });
    }
  });

  /**
   * HLS 세그먼트 파일 제공 (품질별)
   * GET /hls/:mediaId/:quality/:segmentName
   *
   * 핵심! JIT 트랜스코딩 수행
   * - 캐시에 있으면 즉시 반환
   * - 없으면 JIT 트랜스코딩 후 반환
   *
   * 예: /hls/abc123/720p/segment_050.ts
   */
  fastify.get<{ Params: { mediaId: string; quality: string; segmentName: string } }>(
    '/hls/:mediaId/:quality/:segmentName',
    async (request, reply) => {
      const { mediaId, quality, segmentName } = request.params;

      // 세그먼트 파일명 검증 (보안)
      if (!/^segment_\d+\.ts$/.test(segmentName)) {
        return reply.code(400).send({ error: 'Invalid segment name' });
      }

      try {
        // JIT 트랜스코딩 수행 (캐시 확인 → 없으면 트랜스코딩)
        const segmentPath = await getSegment(mediaId, quality, segmentName);

        if (!segmentPath) {
          logger.error('streaming', `Failed to get segment: ${mediaId} / ${quality} / ${segmentName}`);
          return reply.code(500).send({ error: 'Segment transcoding failed' });
        }

        // 세그먼트 파일이 있는지 최종 확인
        if (!existsSync(segmentPath)) {
          logger.error('streaming', `Segment file not found after transcoding: ${segmentPath}`);
          return reply.code(500).send({ error: 'Segment file not found' });
        }

        // 세그먼트 파일 스트림으로 전송
        const stream = createReadStream(segmentPath);

        return reply
          .code(200)
          .header('Content-Type', 'video/mp2t')
          .header('Cache-Control', 'public, max-age=31536000, immutable') // 영구 캐시
          .send(stream);
      } catch (error) {
        logger.error('streaming', `Failed to serve segment ${quality}/${segmentName} for ${mediaId}:`, error);
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
          bitrate: media.bitrate !== null ? Number(media.bitrate) : null,
          fps: media.fps,
          audioCodec: media.audioCodec,
          fileSize: media.fileSize !== null ? Number(media.fileSize) : null,
        },
      });
    } catch (error) {
      logger.error('streaming', `Failed to get media info for ${mediaId}:`, error);
      return reply.code(500).send({ error: 'Failed to get media info' });
    }
  });
};
