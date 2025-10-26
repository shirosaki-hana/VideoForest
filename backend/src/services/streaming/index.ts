import { StreamingService } from './StreamingService.js';
import type { MediaMetadata } from '../../domain/streaming/index.js';

//------------------------------------------------------------------------------//
// JIT 트랜스코딩 + 영구 캐싱 아키텍처
//
// 핵심 개념:
// 1. 미디어 duration 기반으로 플레이리스트 사전 생성
// 2. 세그먼트 요청 시: 캐시 확인 → 없으면 JIT 트랜스코딩
// 3. 트랜스코딩된 세그먼트는 영구 보관 (사용자가 수동 정리)
// 4. Back-seek, 화질 전환 자동 지원
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
