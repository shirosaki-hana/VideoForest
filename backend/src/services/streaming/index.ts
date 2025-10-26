import { existsSync, writeFileSync } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/index.js';
import { getMediaInfo, analyzeMedia } from './media.analyzer.js';
import { generateABRProfiles } from './transcoder/ffmpeg.config.js';
import { generateMasterPlaylist, generateQualityPlaylist } from './playlist.generator.js';
import { transcodeSegment, checkSegmentCache } from './jit.transcoder.js';
import { analyzeKeyframes, validateKeyframeStructure } from './keyframe.analyzer.js';
import { calculateAccurateSegments } from './segment.calculator.js';
import { 
  getPlaylistPath, 
  getMediaDir, 
  getQualityDir, 
  parseSegmentNumber, 
  createSegmentInfo,
  getSegmentPath 
} from './segment.utils.js';
import type { MediaMetadata, TranscodingJob } from './types.js';
//------------------------------------------------------------------------------//
// JIT 트랜스코딩 + 영구 캐싱 아키텍처
//
// 핵심 개념:
// 1. 미디어 duration 기반으로 구라 플레이리스트 사전 생성
// 2. 세그먼트 요청 시: 캐시 확인 → 없으면 JIT 트랜스코딩
// 3. 트랜스코딩된 세그먼트는 영구 보관 (사용자가 수동 정리)
// 4. Back-seek, 화질 전환 자동 지원
//------------------------------------------------------------------------------//

/**
 * 미디어 메타데이터 캐시
 * (플레이리스트 생성 시 한 번만 분석, 이후 재사용)
 */
const metadataCache = new Map<string, MediaMetadata>();

/**
 * 진행 중인 JIT 트랜스코딩 작업 추적
 * (동시 요청 방지 - 같은 세그먼트를 여러 클라이언트가 요청할 수 있음)
 */
const transcodingJobs = new Map<string, TranscodingJob>();

/**
 * 스트리밍 초기화 - Master Playlist 생성
 * 
 * 플로우:
 * 1. 미디어 정보 조회 (DB)
 * 2. 미디어 분석 (호환성, 세그먼트 개수 등)
 * 3. ABR 프로파일 생성
 * 4. Master Playlist 생성 및 저장
 * 5. 각 화질별 Playlist 생성 및 저장 (구라 플레이리스트)
 * 6. 메타데이터 캐시 저장
 * 
 * @param mediaId 미디어 ID
 * @returns Master Playlist 경로 (실패 시 null)
 */
export async function initializeStreaming(mediaId: string): Promise<string | null> {
  // 1. 캐시 확인
  const cached = metadataCache.get(mediaId);
  if (cached) {
    logger.info(`Using cached metadata for ${mediaId}`);
    return getPlaylistPath(mediaId, 'master');
  }

  logger.info(`Initializing streaming for ${mediaId}`);

  // 2. 미디어 정보 조회
  const mediaData = await getMediaInfo(mediaId);
  if (!mediaData) {
    logger.error(`Media not found: ${mediaId}`);
    return null;
  }

  if (!existsSync(mediaData.path)) {
    logger.error(`Media file not found: ${mediaData.path}`);
    return null;
  }

  const { info } = mediaData;

  // Duration 체크
  if (!info.duration || info.duration <= 0) {
    logger.error(`Invalid duration for media ${mediaId}: ${info.duration}`);
    return null;
  }

  // 3. 미디어 분석
  logger.info(`Analyzing media ${mediaId}...`);
  const analysis = analyzeMedia(info);

  if (analysis.totalSegments === 0) {
    logger.error(`Cannot calculate segments for media ${mediaId}`);
    return null;
  }

  // 4. 키프레임 분석 (정확한 세그먼트 생성)
  let keyframeAnalysis: any = undefined;
  let accurateSegments: any = undefined;
  
  try {
    keyframeAnalysis = await analyzeKeyframes(mediaData.path);
    
    // 키프레임 구조 검증
    validateKeyframeStructure(keyframeAnalysis);
    
    // 키프레임 기반으로 정확한 세그먼트 계산
    const segmentCalculation = calculateAccurateSegments(
      keyframeAnalysis.keyframes,
      analysis.segmentDuration,
      info.duration
    );
    
    accurateSegments = segmentCalculation.segments;
    
    logger.info(
      `Keyframe-based segmentation: ${accurateSegments.length} segments ` +
      `(avg: ${segmentCalculation.averageSegmentDuration.toFixed(2)}s)`
    );
  } catch (error) {
    logger.warn(`Keyframe analysis failed, using approximate segmentation: ${error}`);
    // 키프레임 분석 실패 시 근사값 사용 (기존 방식)
    keyframeAnalysis = undefined;
    accurateSegments = undefined;
  }

  // 5. ABR 프로파일 생성
  const availableProfiles = generateABRProfiles(info);
  logger.info(`Available qualities: ${availableProfiles.map(p => p.name).join(', ')}`);

  // 6. 출력 디렉터리 생성
  const mediaDir = getMediaDir(mediaId);
  await mkdir(mediaDir, { recursive: true });

  // 7. Master Playlist 생성
  const masterPlaylistPath = getPlaylistPath(mediaId, 'master');
  const masterPlaylistContent = generateMasterPlaylist(availableProfiles);
  try {
    writeFileSync(masterPlaylistPath, masterPlaylistContent);
    logger.success(`Master playlist created: ${masterPlaylistPath}`);
  } catch (error) {
    logger.error(`Failed to write master playlist: ${error}`);
    return null;
  }

  // 8. 각 화질별 정확한 Playlist 생성
  for (const profile of availableProfiles) {
    const qualityDir = getQualityDir(mediaId, profile.name);
    await mkdir(qualityDir, { recursive: true });

    const qualityPlaylistPath = getPlaylistPath(mediaId, profile.name);
    
    // 키프레임 기반 정확한 세그먼트가 있으면 사용
    const qualityPlaylistContent = generateQualityPlaylist(
      info.duration,
      analysis.segmentDuration,
      accurateSegments // 정확한 세그먼트 전달
    );

    try {
      writeFileSync(qualityPlaylistPath, qualityPlaylistContent);
      logger.success(`Quality playlist created: ${profile.name}`);
    } catch (error) {
      logger.error(`Failed to write quality playlist for ${profile.name}: ${error}`);
      return null;
    }
  }

  // 9. 메타데이터 캐시 저장 (키프레임 분석 결과 포함)
  const metadata: MediaMetadata = {
    mediaId,
    mediaPath: mediaData.path,
    duration: info.duration,
    segmentDuration: analysis.segmentDuration,
    totalSegments: accurateSegments?.length || analysis.totalSegments,
    availableProfiles,
    analysis,
    keyframeAnalysis, // 키프레임 분석 결과
    accurateSegments, // 정확한 세그먼트 정보
  };

  metadataCache.set(mediaId, metadata);

  logger.success(
    `Streaming initialized for ${mediaId} ` +
    `(${metadata.totalSegments} segments, ${availableProfiles.length} qualities)`
  );

  return masterPlaylistPath;
}

/**
 * 세그먼트 요청 처리 - 캐시 확인 → JIT 트랜스코딩
 * 
 * 핵심 플로우:
 * 1. 메타데이터 확인 (없으면 초기화)
 * 2. 세그먼트 번호 파싱
 * 3. 캐시 확인
 * 4. 캐시 없으면 JIT 트랜스코딩 (중복 요청 방지)
 * 5. 세그먼트 파일 경로 반환
 * 
 * @param mediaId 미디어 ID
 * @param quality 화질 (예: "720p")
 * @param segmentFileName 세그먼트 파일명 (예: "segment_050.ts")
 * @returns 세그먼트 파일 경로 (실패 시 null)
 */
export async function getSegment(
  mediaId: string,
  quality: string,
  segmentFileName: string
): Promise<string | null> {
  // 1. 메타데이터 확인
  let metadata = metadataCache.get(mediaId);
  if (!metadata) {
    logger.info(`Metadata not cached for ${mediaId}, initializing...`);
    const masterPath = await initializeStreaming(mediaId);
    if (!masterPath) {
      return null;
    }
    metadata = metadataCache.get(mediaId);
    if (!metadata) {
      logger.error(`Failed to load metadata for ${mediaId}`);
      return null;
    }
  }

  // 2. 세그먼트 번호 파싱
  const segmentNumber = parseSegmentNumber(segmentFileName);
  if (segmentNumber === null) {
    logger.error(`Invalid segment filename: ${segmentFileName}`);
    return null;
  }

  // 범위 체크
  if (segmentNumber < 0 || segmentNumber >= metadata.totalSegments) {
    logger.error(
      `Segment ${segmentNumber} out of range (0-${metadata.totalSegments - 1})`
    );
    return null;
  }

  // 화질 체크
  const profile = metadata.availableProfiles.find(p => p.name === quality);
  if (!profile) {
    logger.error(`Quality ${quality} not available for ${mediaId}`);
    return null;
  }

  // 3. 캐시 확인
  const cachedPath = checkSegmentCache(mediaId, quality, segmentNumber);
  if (cachedPath) {
    return cachedPath;
  }

  // 4. JIT 트랜스코딩 (중복 요청 방지)
  const jobKey = `${mediaId}:${quality}:${segmentNumber}`;
  
  // 이미 트랜스코딩 중인 경우 기다림
  const existingJob = transcodingJobs.get(jobKey);
  if (existingJob) {
    logger.info(`Transcoding already in progress for ${jobKey}, waiting...`);
    return await existingJob.promise;
  }

  // 새로운 트랜스코딩 작업 시작
  const promise = performJITTranscoding(
    metadata,
    quality,
    segmentNumber,
    profile
  );

  // 작업 등록
  const job: TranscodingJob = {
    mediaId,
    quality,
    segmentNumber,
    promise,
    startTime: Date.now(),
  };
  transcodingJobs.set(jobKey, job);

  try {
    return await promise;
  } finally {
    // 작업 완료 후 제거
    transcodingJobs.delete(jobKey);
  }
}

/**
 * JIT 트랜스코딩 수행
 * 
 * @param metadata 미디어 메타데이터
 * @param quality 화질
 * @param segmentNumber 세그먼트 번호
 * @param profile 화질 프로파일
 * @returns 세그먼트 파일 경로 (실패 시 null)
 */
async function performJITTranscoding(
  metadata: MediaMetadata,
  quality: string,
  segmentNumber: number,
  profile: ReturnType<typeof generateABRProfiles>[0]
): Promise<string | null> {
  const { mediaId, mediaPath, duration, segmentDuration, analysis, accurateSegments } = metadata;

  // 세그먼트 정보 생성
  // 정확한 세그먼트가 있으면 사용, 없으면 근사값 사용
  let segmentInfo;
  if (accurateSegments && accurateSegments.length > 0) {
    segmentInfo = accurateSegments.find(s => s.segmentNumber === segmentNumber);
    if (!segmentInfo) {
      logger.error(`Accurate segment ${segmentNumber} not found`);
      return null;
    }
  } else {
    segmentInfo = createSegmentInfo(segmentNumber, segmentDuration, duration);
  }

  // 출력 경로
  const outputPath = getSegmentPath(mediaId, quality, segmentNumber);

  logger.info(
    `Starting JIT transcoding: ${mediaId} / ${quality} / segment ${segmentNumber}`
  );

  // 트랜스코딩 실행
  const success = await transcodeSegment(
    mediaPath,
    segmentInfo,
    profile,
    analysis,
    outputPath
  );

  if (!success) {
    logger.error(`JIT transcoding failed for segment ${segmentNumber}`);
    return null;
  }

  // 생성된 파일 확인
  if (!existsSync(outputPath)) {
    logger.error(`Transcoded segment file not found: ${outputPath}`);
    return null;
  }

  return outputPath;
}

/**
 * Master Playlist 경로 조회 (자동 초기화)
 * 
 * @param mediaId 미디어 ID
 * @returns Master Playlist 경로
 */
export async function getMasterPlaylistPath(mediaId: string): Promise<string | null> {
  const cached = metadataCache.get(mediaId);
  if (cached) {
    return getPlaylistPath(mediaId, 'master');
  }

  return await initializeStreaming(mediaId);
}

/**
 * 화질별 Playlist 경로 조회
 * 
 * @param mediaId 미디어 ID
 * @param quality 화질
 * @returns Playlist 경로 (실패 시 null)
 */
export async function getQualityPlaylistPath(
  mediaId: string,
  quality: string
): Promise<string | null> {
  // 메타데이터 확인 (없으면 초기화)
  let metadata = metadataCache.get(mediaId);
  if (!metadata) {
    await initializeStreaming(mediaId);
    metadata = metadataCache.get(mediaId);
  }

  if (!metadata) {
    return null;
  }

  // 화질 체크
  const hasQuality = metadata.availableProfiles.some(p => p.name === quality);
  if (!hasQuality) {
    logger.error(`Quality ${quality} not available for ${mediaId}`);
    return null;
  }

  return getPlaylistPath(mediaId, quality);
}

/**
 * 메타데이터 캐시 제거 (메모리 정리용)
 * 
 * @param mediaId 미디어 ID
 */
export function clearMetadataCache(mediaId?: string): void {
  if (mediaId) {
    metadataCache.delete(mediaId);
    logger.info(`Cleared metadata cache for ${mediaId}`);
  } else {
    metadataCache.clear();
    logger.info('Cleared all metadata cache');
  }
}

/**
 * 진행 중인 트랜스코딩 작업 통계
 */
export function getTranscodingStats() {
  const jobs = Array.from(transcodingJobs.values());
  return {
    activeJobs: jobs.length,
    jobs: jobs.map(job => ({
      mediaId: job.mediaId,
      quality: job.quality,
      segmentNumber: job.segmentNumber,
      duration: Date.now() - job.startTime,
    })),
  };
}

/**
 * 메타데이터 조회 (디버그용)
 */
export function getMetadata(mediaId: string): MediaMetadata | undefined {
  return metadataCache.get(mediaId);
}

/**
 * 모든 메타데이터 조회 (디버그용)
 */
export function getAllMetadata(): MediaMetadata[] {
  return Array.from(metadataCache.values());
}

