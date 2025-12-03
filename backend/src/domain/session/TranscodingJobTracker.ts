import type { TranscodingJob } from '../types.js';
//------------------------------------------------------------------------------//

/**
 * 진행 중인 트랜스코딩 작업 추적
 *
 * 책임:
 * - 동시 요청 방지 (같은 세그먼트를 여러 클라이언트가 요청할 수 있음)
 * - 작업 상태 추적 및 통계 제공
 */
export class TranscodingJobTracker {
  private jobs = new Map<string, TranscodingJob>();

  /**
   * 작업 키 생성
   */
  private createJobKey(mediaId: string, quality: string, segmentNumber: number): string {
    return `${mediaId}:${quality}:${segmentNumber}`;
  }

  /**
   * 진행 중인 작업 조회
   */
  get(mediaId: string, quality: string, segmentNumber: number): TranscodingJob | undefined {
    const key = this.createJobKey(mediaId, quality, segmentNumber);
    return this.jobs.get(key);
  }

  /**
   * 작업 등록
   */
  register(job: TranscodingJob): void {
    const key = this.createJobKey(job.mediaId, job.quality, job.segmentNumber);
    this.jobs.set(key, job);
  }

  /**
   * 작업 완료 (제거)
   */
  complete(mediaId: string, quality: string, segmentNumber: number): void {
    const key = this.createJobKey(mediaId, quality, segmentNumber);
    this.jobs.delete(key);
  }

  /**
   * 진행 중인 작업 통계
   */
  getStats() {
    const jobs = Array.from(this.jobs.values());
    const prefetchJobs = jobs.filter(job => job.isPrefetch);
    return {
      activeJobs: jobs.length,
      activePrefetchJobs: prefetchJobs.length,
      jobs: jobs.map(job => ({
        mediaId: job.mediaId,
        quality: job.quality,
        segmentNumber: job.segmentNumber,
        duration: Date.now() - job.startTime,
        isPrefetch: job.isPrefetch ?? false,
      })),
    };
  }

  /**
   * 진행 중인 프리페치 작업 수
   */
  getPrefetchCount(): number {
    return Array.from(this.jobs.values()).filter(job => job.isPrefetch).length;
  }

  /**
   * 모든 작업 조회
   */
  getAll(): TranscodingJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * 작업 개수
   */
  get size(): number {
    return this.jobs.size;
  }

  /**
   * 모든 작업 제거
   */
  clear(): void {
    this.jobs.clear();
  }
}
