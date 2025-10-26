import type { MediaMetadata } from '../types.js';

/**
 * 미디어 메타데이터 캐시 관리
 * 
 * 책임:
 * - 메타데이터 저장/조회/삭제
 * - 메모리 기반 캐싱 (플레이리스트 생성 시 한 번만 분석, 이후 재사용)
 */
export class MetadataCache {
  private cache = new Map<string, MediaMetadata>();

  /**
   * 메타데이터 저장
   */
  set(mediaId: string, metadata: MediaMetadata): void {
    this.cache.set(mediaId, metadata);
  }

  /**
   * 메타데이터 조회
   */
  get(mediaId: string): MediaMetadata | undefined {
    return this.cache.get(mediaId);
  }

  /**
   * 메타데이터 존재 여부 확인
   */
  has(mediaId: string): boolean {
    return this.cache.has(mediaId);
  }

  /**
   * 메타데이터 삭제
   * @param mediaId 미디어 ID (없으면 전체 삭제)
   */
  delete(mediaId?: string): void {
    if (mediaId) {
      this.cache.delete(mediaId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 모든 메타데이터 조회
   */
  getAll(): MediaMetadata[] {
    return Array.from(this.cache.values());
  }

  /**
   * 캐시 크기
   */
  get size(): number {
    return this.cache.size;
  }
}

