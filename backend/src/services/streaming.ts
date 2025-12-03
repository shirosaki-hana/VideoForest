import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { logger } from '../utils/index.js';
import { database } from '../database/index.js';
import { env } from '../config/index.js';
import {
  MetadataCache,
  TranscodingJobTracker,
  SegmentUtils,
  SegmentCalculator,
  MediaAnalyzer,
  PlaylistGenerator,
  QualityProfileSelector,
  type MediaInfo,
  type MediaMetadata,
  type QualityProfile,
  type AccurateSegmentInfo,
  type TranscodingJob,
  type KeyframeAnalysis,
} from '../domain/index.js';
import { FFmpegTranscoder, FFprobeAnalyzer } from '../infrastructure/index.js';
//------------------------------------------------------------------------------//
// JIT 트랜스코딩 + 영구 캐싱 아키텍처
//
// 핵심 개념:
// 1. 미디어 duration 기반으로 플레이리스트 사전 생성
// 2. 세그먼트 요청 시: 캐시 확인 → 없으면 JIT 트랜스코딩
// 3. 트랜스코딩된 세그먼트는 영구 보관 (사용자가 수동 정리)
// 4. Back-seek, 화질 전환 자동 지원
//------------------------------------------------------------------------------//

/**
 * 스트리밍 서비스
 *
 * 책임:
 * - 미디어 스트리밍 초기화 및 관리
 * - 세그먼트 요청 처리
 * - JIT 트랜스코딩 오케스트레이션
 * - 외부 의존성 통합 (DB, FFmpeg, 파일시스템)
 */
class StreamingService {
  private metadataCache: MetadataCache;
  private transcodingJobs: TranscodingJobTracker;

  constructor() {
    this.metadataCache = new MetadataCache();
    this.transcodingJobs = new TranscodingJobTracker();
  }

  /**
   * 스트리밍 초기화 - Master Playlist 생성
   *
   * 플로우:
   * 1. 미디어 정보 조회 (DB)
   * 2. 미디어 분석 (호환성, 세그먼트 개수 등)
   * 3. ABR 프로파일 생성
   * 4. Master Playlist 생성 및 저장
   * 5. 각 화질별 Playlist 생성 및 저장
   * 6. 메타데이터 캐시 저장
   */
  async initializeStreaming(mediaId: string): Promise<string | null> {
    // 1. 캐시 확인
    if (this.metadataCache.has(mediaId)) {
      logger.debug('streaming', `Using cached metadata for ${mediaId}`);
      return SegmentUtils.getPlaylistPath(mediaId, 'master');
    }

    logger.debug('streaming', `Initializing streaming for ${mediaId}`);

    // 2. 미디어 정보 조회
    const mediaData = await this.getMediaInfo(mediaId);
    if (!mediaData) {
      logger.error('streaming', `Media not found: ${mediaId}`);
      return null;
    }

    if (!existsSync(mediaData.path)) {
      logger.error('streaming', `Media file not found: ${mediaData.path}`);
      return null;
    }

    const { info } = mediaData;

    // Duration 체크
    if (!info.duration || info.duration <= 0) {
      logger.error('streaming', `Invalid duration for media ${mediaId}: ${info.duration}`);
      return null;
    }

    // 3. 미디어 분석
    logger.debug('streaming', `Analyzing media ${mediaId}...`);
    const analysis = MediaAnalyzer.analyze(info);

    if (analysis.totalSegments === 0) {
      logger.error('streaming', `Cannot calculate segments for media ${mediaId}`);
      return null;
    }

    // 4. 키프레임 분석 (정확한 세그먼트 생성)
    let accurateSegments: AccurateSegmentInfo[] | undefined;
    let keyframeAnalysis: KeyframeAnalysis | undefined;

    try {
      const analyzer = new FFprobeAnalyzer();
      keyframeAnalysis = await analyzer.analyzeKeyframes(mediaData.path);

      // 키프레임 구조 검증
      analyzer.validateStructure(keyframeAnalysis);

      // 키프레임 기반으로 정확한 세그먼트 계산
      const segmentCalculation = SegmentCalculator.calculateAccurateSegments(
        keyframeAnalysis.keyframes,
        analysis.segmentDuration,
        info.duration
      );

      accurateSegments = segmentCalculation.segments;

      logger.debug(
        'streaming',
        `Keyframe-based segmentation: ${accurateSegments.length} segments ` +
          `(avg: ${segmentCalculation.averageSegmentDuration.toFixed(2)}s)`
      );
    } catch (error) {
      logger.warn('streaming', `Keyframe analysis failed, using approximate segmentation: ${error}`);
      accurateSegments = undefined;
      keyframeAnalysis = undefined;
    }

    // 5. ABR 프로파일 생성
    const availableProfiles = QualityProfileSelector.generateABR(info);
    logger.debug('streaming', `Available qualities: ${availableProfiles.map(p => p.name).join(', ')}`);

    // 6. 출력 디렉터리 생성
    const mediaDir = SegmentUtils.getMediaDir(mediaId);
    await mkdir(mediaDir, { recursive: true });

    // 7. Master Playlist 생성
    const masterPlaylistPath = SegmentUtils.getPlaylistPath(mediaId, 'master');
    const masterPlaylistContent = PlaylistGenerator.generateMaster(availableProfiles);
    try {
      await writeFile(masterPlaylistPath, masterPlaylistContent);
      logger.debug('streaming', `Master playlist created: ${masterPlaylistPath}`);
    } catch (error) {
      logger.error('streaming', `Failed to write master playlist.`, error);
      return null;
    }

    // 8. 각 화질별 Playlist 생성
    for (const profile of availableProfiles) {
      const qualityDir = SegmentUtils.getQualityDir(mediaId, profile.name);
      await mkdir(qualityDir, { recursive: true });

      const qualityPlaylistPath = SegmentUtils.getPlaylistPath(mediaId, profile.name);
      const qualityPlaylistContent = PlaylistGenerator.generateQuality(info.duration, analysis.segmentDuration, accurateSegments);

      try {
        await writeFile(qualityPlaylistPath, qualityPlaylistContent);
        logger.debug('streaming', `Quality playlist created: ${profile.name}`);
      } catch (error) {
        logger.error('streaming', `Failed to write quality playlist for ${profile.name}.`, error);
        return null;
      }
    }

    // 9. 메타데이터 캐시 저장
    const metadata: MediaMetadata = {
      mediaId,
      mediaPath: mediaData.path,
      duration: info.duration,
      segmentDuration: analysis.segmentDuration,
      totalSegments: accurateSegments?.length || analysis.totalSegments,
      availableProfiles,
      analysis,
      keyframeAnalysis,
      accurateSegments,
    };

    this.metadataCache.set(mediaId, metadata);

    logger.debug(
      'streaming',
      `Streaming initialized for ${mediaId} ` + `(${metadata.totalSegments} segments, ${availableProfiles.length} qualities)`
    );

    return masterPlaylistPath;
  }

  /**
   * 세그먼트 요청 처리 - 캐시 확인 → JIT 트랜스코딩
   */
  async getSegment(mediaId: string, quality: string, segmentFileName: string): Promise<string | null> {
    // 1. 메타데이터 확인
    let metadata = this.metadataCache.get(mediaId);
    if (!metadata) {
      logger.debug('streaming', `Metadata not cached for ${mediaId}, initializing...`);
      const masterPath = await this.initializeStreaming(mediaId);
      if (!masterPath) {
        return null;
      }
      metadata = this.metadataCache.get(mediaId);
      if (!metadata) {
        logger.error('streaming', `Failed to load metadata for ${mediaId}`);
        return null;
      }
    }

    // 2. 세그먼트 번호 파싱
    const segmentNumber = SegmentUtils.parseNumber(segmentFileName);
    if (segmentNumber === null) {
      logger.error('streaming', `Invalid segment filename: ${segmentFileName}`);
      return null;
    }

    // 범위 체크
    if (segmentNumber < 0 || segmentNumber >= metadata.totalSegments) {
      logger.error('streaming', `Segment ${segmentNumber} out of range (0-${metadata.totalSegments - 1})`);
      return null;
    }

    // 화질 체크
    const profile = metadata.availableProfiles.find(p => p.name === quality);
    if (!profile) {
      logger.error('streaming', `Quality ${quality} not available for ${mediaId}`);
      return null;
    }

    // 3. 캐시 확인
    const cachedPath = FFmpegTranscoder.checkCache(mediaId, quality, segmentNumber);
    if (cachedPath) {
      // 캐시 히트 시에도 다음 세그먼트 프리페칭 트리거
      this.prefetchSegments(metadata, quality, segmentNumber, profile);
      return cachedPath;
    }

    // 4. JIT 트랜스코딩 (중복 요청 방지)
    const existingJob = this.transcodingJobs.get(mediaId, quality, segmentNumber);
    if (existingJob) {
      logger.debug('streaming', `Transcoding already in progress for ${mediaId}:${quality}:${segmentNumber}, waiting...`);
      const result = await existingJob.promise;
      // 기존 작업 완료 후 프리페칭 트리거
      this.prefetchSegments(metadata, quality, segmentNumber, profile);
      return result;
    }

    // 새로운 트랜스코딩 작업 시작
    const promise = this.performJITTranscoding(metadata, quality, segmentNumber, profile);

    // 작업 등록
    const job: TranscodingJob = {
      mediaId,
      quality,
      segmentNumber,
      promise,
      startTime: Date.now(),
    };
    this.transcodingJobs.register(job);

    try {
      const result = await promise;
      // 트랜스코딩 완료 후 다음 세그먼트 프리페칭 트리거
      this.prefetchSegments(metadata, quality, segmentNumber, profile);
      return result;
    } finally {
      // 작업 완료 후 제거
      this.transcodingJobs.complete(mediaId, quality, segmentNumber);
    }
  }

  /**
   * JIT 트랜스코딩 수행
   */
  private async performJITTranscoding(
    metadata: MediaMetadata,
    quality: string,
    segmentNumber: number,
    profile: QualityProfile
  ): Promise<string | null> {
    const { mediaId, mediaPath, duration, segmentDuration, analysis, accurateSegments } = metadata;

    // 세그먼트 정보 생성
    let segmentInfo;
    if (accurateSegments && accurateSegments.length > 0) {
      segmentInfo = accurateSegments.find(s => s.segmentNumber === segmentNumber);
      if (!segmentInfo) {
        logger.error('streaming', `Accurate segment ${segmentNumber} not found`);
        return null;
      }
    } else {
      segmentInfo = SegmentUtils.createInfo(segmentNumber, segmentDuration, duration);
    }

    // 출력 경로
    const outputPath = SegmentUtils.getPath(mediaId, quality, segmentNumber);

    logger.debug('streaming', `Starting JIT transcoding: ${mediaId} / ${quality} / segment ${segmentNumber}`);

    // 트랜스코딩 실행
    const transcoder = new FFmpegTranscoder();
    const success = await transcoder.transcodeSegment(mediaPath, segmentInfo, profile, analysis, outputPath);

    if (!success) {
      logger.error('streaming', `JIT transcoding failed for segment ${segmentNumber}`);
      return null;
    }

    // 생성된 파일 확인
    if (!existsSync(outputPath)) {
      logger.error('streaming', `Transcoded segment file not found: ${outputPath}`);
      return null;
    }

    return outputPath;
  }

  /**
   * 프리페칭 수행 (백그라운드, Fire-and-Forget)
   *
   * 요청된 세그먼트 이후 N개의 세그먼트를 미리 트랜스코딩
   * - 동시 프리페치 작업 수 제한
   * - 이미 캐시된 세그먼트는 스킵
   * - 이미 트랜스코딩 중인 세그먼트는 스킵
   */
  private prefetchSegments(metadata: MediaMetadata, quality: string, currentSegmentNumber: number, profile: QualityProfile): void {
    // 프리페칭 비활성화 체크
    if (!env.VIDEOFOREST_PREFETCH_ENABLED) {
      return;
    }

    const prefetchCount = env.VIDEOFOREST_PREFETCH_COUNT;
    const maxConcurrentPrefetch = env.VIDEOFOREST_MAX_CONCURRENT_PREFETCH;
    const maxSegment = metadata.totalSegments - 1;

    // 현재 프리페치 작업 수 체크
    const activePrefetchCount = this.transcodingJobs.getPrefetchCount();
    if (activePrefetchCount >= maxConcurrentPrefetch) {
      logger.debug?.('streaming', `Prefetch limit reached (${activePrefetchCount}/${maxConcurrentPrefetch}), skipping`);
      return;
    }

    // 남은 슬롯 수 계산
    const availableSlots = maxConcurrentPrefetch - activePrefetchCount;
    const segmentsToPrefetch = Math.min(prefetchCount, availableSlots);

    let prefetchedCount = 0;

    for (let i = 1; i <= prefetchCount && prefetchedCount < segmentsToPrefetch; i++) {
      const nextSegmentNumber = currentSegmentNumber + i;

      // 범위 초과 체크
      if (nextSegmentNumber > maxSegment) {
        break;
      }

      // 이미 캐시됨 → 스킵
      if (FFmpegTranscoder.isCached(metadata.mediaId, quality, nextSegmentNumber)) {
        continue;
      }

      // 이미 트랜스코딩 진행 중 → 스킵
      if (this.transcodingJobs.get(metadata.mediaId, quality, nextSegmentNumber)) {
        continue;
      }

      // 백그라운드로 트랜스코딩 시작 (await 없음!)
      const promise = this.performJITTranscoding(metadata, quality, nextSegmentNumber, profile);

      // 작업 등록 (중복 방지)
      const job: TranscodingJob = {
        mediaId: metadata.mediaId,
        quality,
        segmentNumber: nextSegmentNumber,
        promise,
        startTime: Date.now(),
        isPrefetch: true,
      };
      this.transcodingJobs.register(job);

      // 완료 시 정리 (fire-and-forget이지만 작업 추적은 정리)
      promise.finally(() => {
        this.transcodingJobs.complete(metadata.mediaId, quality, nextSegmentNumber);
      });

      prefetchedCount++;
      logger.debug?.('streaming', `Prefetching segment ${nextSegmentNumber} for ${metadata.mediaId}/${quality}`);
    }

    if (prefetchedCount > 0) {
      logger.debug('streaming', `Started prefetching ${prefetchedCount} segment(s) after segment ${currentSegmentNumber}`);
    }
  }

  /**
   * Master Playlist 경로 조회 (자동 초기화)
   */
  async getMasterPlaylistPath(mediaId: string): Promise<string | null> {
    if (this.metadataCache.has(mediaId)) {
      return SegmentUtils.getPlaylistPath(mediaId, 'master');
    }
    return await this.initializeStreaming(mediaId);
  }

  /**
   * 화질별 Playlist 경로 조회
   */
  async getQualityPlaylistPath(mediaId: string, quality: string): Promise<string | null> {
    // 메타데이터 확인 (없으면 초기화)
    let metadata = this.metadataCache.get(mediaId);
    if (!metadata) {
      await this.initializeStreaming(mediaId);
      metadata = this.metadataCache.get(mediaId);
    }

    if (!metadata) {
      return null;
    }

    // 화질 체크
    const hasQuality = metadata.availableProfiles.some(p => p.name === quality);
    if (!hasQuality) {
      logger.error('streaming', `Quality ${quality} not available for ${mediaId}`);
      return null;
    }

    return SegmentUtils.getPlaylistPath(mediaId, quality);
  }

  /**
   * 메타데이터 캐시 제거
   */
  clearMetadataCache(mediaId?: string): void {
    this.metadataCache.delete(mediaId);
    if (mediaId) {
      logger.debug('streaming', `Cleared metadata cache for ${mediaId}`);
    } else {
      logger.debug('streaming', 'Cleared all metadata cache');
    }
  }

  /**
   * 진행 중인 트랜스코딩 작업 통계
   */
  getTranscodingStats() {
    return this.transcodingJobs.getStats();
  }

  /**
   * 메타데이터 조회 (디버그용)
   */
  getMetadata(mediaId: string): MediaMetadata | undefined {
    return this.metadataCache.get(mediaId);
  }

  /**
   * 모든 메타데이터 조회 (디버그용)
   */
  getAllMetadata(): MediaMetadata[] {
    return this.metadataCache.getAll();
  }

  /**
   * 미디어 정보 조회 (DB)
   */
  private async getMediaInfo(mediaId: string): Promise<{ path: string; info: MediaInfo } | null> {
    const media = await database.media.findUnique({
      where: { id: mediaId },
    });

    if (!media || !media.filePath) {
      return null;
    }

    return {
      path: media.filePath,
      info: {
        width: media.width,
        height: media.height,
        duration: media.duration,
        codec: media.codec,
        audioCodec: media.audioCodec,
        fps: media.fps,
        bitrate: media.bitrate !== null ? Number(media.bitrate) : null,
      },
    };
  }
}

//------------------------------------------------------------------------------//
// 싱글톤 인스턴스 및 Public API
//------------------------------------------------------------------------------//

// 싱글톤 인스턴스
const streamingService = new StreamingService();

/**
 * 스트리밍 초기화 - Master Playlist 생성
 */
export async function initializeStreaming(mediaId: string): Promise<string | null> {
  return streamingService.initializeStreaming(mediaId);
}

/**
 * 세그먼트 요청 처리 - 캐시 확인 → JIT 트랜스코딩
 */
export async function getSegment(mediaId: string, quality: string, segmentFileName: string): Promise<string | null> {
  return streamingService.getSegment(mediaId, quality, segmentFileName);
}

/**
 * Master Playlist 경로 조회 (자동 초기화)
 */
export async function getMasterPlaylistPath(mediaId: string): Promise<string | null> {
  return streamingService.getMasterPlaylistPath(mediaId);
}

/**
 * 화질별 Playlist 경로 조회
 */
export async function getQualityPlaylistPath(mediaId: string, quality: string): Promise<string | null> {
  return streamingService.getQualityPlaylistPath(mediaId, quality);
}

/**
 * 메타데이터 캐시 제거 (메모리 정리용)
 */
export function clearMetadataCache(mediaId?: string): void {
  streamingService.clearMetadataCache(mediaId);
}

/**
 * 진행 중인 트랜스코딩 작업 통계
 */
export function getTranscodingStats() {
  return streamingService.getTranscodingStats();
}

/**
 * 메타데이터 조회 (디버그용)
 */
export function getMetadata(mediaId: string): MediaMetadata | undefined {
  return streamingService.getMetadata(mediaId);
}

/**
 * 모든 메타데이터 조회 (디버그용)
 */
export function getAllMetadata(): MediaMetadata[] {
  return streamingService.getAllMetadata();
}
