import fs from 'fs/promises';
import type { HLSSession, TranscodingFailure } from './types.js';
import { logger } from '../../utils/index.js';
import { killFFmpegProcess } from './transcoder/index.js';
//------------------------------------------------------------------------------//

/**
 * HLS 세션 관리자
 *
 * 활성 스트리밍 세션을 관리하고 자동 정리를 수행합니다.
 * 실패한 트랜스코딩을 추적하여 무한 재시도를 방지합니다.
 */
export class SessionManager {
  private sessions = new Map<string, HLSSession>();
  private deletingSessions = new Set<string>(); // 삭제 중인 세션 추적
  private failures = new Map<string, TranscodingFailure>();
  private starting = new Map<string, Promise<HLSSession | null>>(); // 생성 중인 세션 프라미스
  private stoppedTombstones = new Map<string, number>(); // 최근 중지된 세션 마커
  private startingVariants = new Map<string, Promise<string | null>>(); // 생성 중인 variant 프라미스 (key: "mediaId:quality")
  private readonly sessionTimeout: number;
  private readonly variantTimeout: number;
  private readonly failureTimeout: number;
  private readonly stoppedTombstoneTtl: number = 5 * 1000; // 5초동안 재시작 방지
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    sessionTimeout: number = 30 * 60 * 1000, // 30분: 전체 세션 타임아웃
    variantTimeout: number = 10 * 60 * 1000, // 10분: 개별 variant 타임아웃
    failureTimeout: number = 10 * 60 * 1000 // 10분간 실패 기록 유지
  ) {
    this.sessionTimeout = sessionTimeout;
    this.variantTimeout = variantTimeout;
    this.failureTimeout = failureTimeout;
    this.startCleanupTask();
  }

  /**
   * 세션 추가
   */
  addSession(session: HLSSession): void {
    this.sessions.set(session.mediaId, session);
    logger.info(`Session created for media ${session.mediaId}`);
  }

  /**
   * 세션 조회
   */
  getSession(mediaId: string): HLSSession | undefined {
    const session = this.sessions.get(mediaId);
    if (session) {
      // 마지막 접근 시간 업데이트
      session.lastAccess = Date.now();
    }
    return session;
  }

  /**
   * 특정 품질 variant가 존재하는지 확인
   */
  hasVariant(mediaId: string, quality: string): boolean {
    const session = this.sessions.get(mediaId);
    return session?.variants.has(quality) ?? false;
  }

  /**
   * 특정 품질 variant 조회
   */
  getVariant(mediaId: string, quality: string): import('./types.js').VariantSession | undefined {
    const session = this.sessions.get(mediaId);
    if (session) {
      const now = Date.now();
      session.lastAccess = now;
      const variant = session.variants.get(quality);
      // variant가 활성적으로 사용되고 있으므로 lastSegmentTime도 업데이트
      if (variant) {
        variant.lastSegmentTime = now;
      }
      return variant;
    }
    return undefined;
  }

  /**
   * 특정 품질 variant 추가
   */
  addVariant(mediaId: string, quality: string, variant: import('./types.js').VariantSession): void {
    const session = this.sessions.get(mediaId);
    if (!session) {
      logger.error(`Cannot add variant: session ${mediaId} not found`);
      return;
    }

    session.variants.set(quality, variant);
    logger.info(`Added ${quality} variant to session ${mediaId}`);
  }

  /**
   * 특정 품질 variant가 준비되었는지 확인 (첫 세그먼트 생성 완료)
   */
  isVariantReady(mediaId: string, quality: string): boolean {
    const variant = this.getVariant(mediaId, quality);
    return variant?.isReady ?? false;
  }

  /**
   * 세션 존재 여부 확인 (삭제 중인 세션 포함)
   */
  hasSession(mediaId: string): boolean {
    return this.sessions.has(mediaId);
  }

  /**
   * 세션 생성 프라미스 조회/설정/해제
   */
  getStarting(mediaId: string): Promise<HLSSession | null> | undefined {
    return this.starting.get(mediaId);
  }

  setStarting(mediaId: string, promise: Promise<HLSSession | null>): void {
    this.starting.set(mediaId, promise);
  }

  clearStarting(mediaId: string): void {
    this.starting.delete(mediaId);
  }

  /**
   * Variant 생성 프라미스 조회/설정/해제
   */
  private getVariantKey(mediaId: string, quality: string): string {
    return `${mediaId}:${quality}`;
  }

  getStartingVariant(mediaId: string, quality: string): Promise<string | null> | undefined {
    return this.startingVariants.get(this.getVariantKey(mediaId, quality));
  }

  setStartingVariant(mediaId: string, quality: string, promise: Promise<string | null>): void {
    this.startingVariants.set(this.getVariantKey(mediaId, quality), promise);
  }

  clearStartingVariant(mediaId: string, quality: string): void {
    this.startingVariants.delete(this.getVariantKey(mediaId, quality));
  }

  /**
   * 세션이 삭제 중인지 확인
   */
  isDeletingSession(mediaId: string): boolean {
    return this.deletingSessions.has(mediaId);
  }

  /**
   * 세션 삭제가 완료될 때까지 대기
   *
   * @param mediaId 대기할 미디어 ID
   * @param timeoutMs 최대 대기 시간 (기본 10초)
   * @returns 삭제 완료 여부 (true: 완료, false: 타임아웃)
   */
  async waitForSessionDeletion(mediaId: string, timeoutMs: number = 10000): Promise<boolean> {
    if (!this.deletingSessions.has(mediaId)) {
      return true; // 이미 삭제 완료
    }

    const startTime = Date.now();
    while (this.deletingSessions.has(mediaId)) {
      if (Date.now() - startTime > timeoutMs) {
        logger.warn(`Timeout waiting for session deletion: ${mediaId}`);
        return false; // 타임아웃
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return true;
  }

  /**
   * 세션 삭제
   */
  async removeSession(mediaId: string): Promise<void> {
    const session = this.sessions.get(mediaId);
    if (!session) {
      // 이미 삭제 중인 경우 대기
      if (this.deletingSessions.has(mediaId)) {
        logger.info(`Session ${mediaId} is already being deleted, waiting...`);
        await this.waitForSessionDeletion(mediaId);
      }
      return;
    }

    // 이미 삭제 중이면 대기
    if (this.deletingSessions.has(mediaId)) {
      logger.info(`Session ${mediaId} is already being deleted, waiting...`);
      await this.waitForSessionDeletion(mediaId);
      return;
    }

    // 삭제 시작 - 즉시 Map에서 제거하고 삭제 중 상태로 표시
    this.sessions.delete(mediaId);
    this.deletingSessions.add(mediaId);

    logger.info(`Removing session for media ${mediaId}`);

    try {
      // 진행 중인 variant 시작 프라미스 정리
      const startingVariantKeys = Array.from(this.startingVariants.keys())
        .filter(key => key.startsWith(`${mediaId}:`));
      for (const key of startingVariantKeys) {
        this.startingVariants.delete(key);
        logger.info(`Cancelled starting variant: ${key}`);
      }

      // 모든 variant의 FFmpeg 프로세스 종료
      const variantKillPromises = Array.from(session.variants.values()).map(async variant => {
        try {
          await killFFmpegProcess(variant.process);
        } catch (error) {
          logger.error(`Failed to kill FFmpeg process for variant ${variant.profile.name}:`, error);
        }
      });

      await Promise.all(variantKillPromises);

      // 출력 디렉터리 삭제 (모든 variant 포함)
      try {
        await fs.rm(session.outputDir, { recursive: true, force: true });
      } catch (error) {
        logger.error(`Failed to remove output directory for ${mediaId}:`, error);
      }

      logger.success(`Session removed for media ${mediaId} (${session.variants.size} variants)`);
    } finally {
      // 삭제 완료 - 상태 제거
      this.deletingSessions.delete(mediaId);
      // 최근 중지 마커 설정 (짧은 시간 재시작 방지)
      this.markStopped(mediaId);
    }
  }

  /**
   * 모든 세션 제거
   */
  async removeAllSessions(): Promise<void> {
    logger.info('Removing all sessions...');
    const mediaIds = Array.from(this.sessions.keys());
    await Promise.all(mediaIds.map(id => this.removeSession(id)));
    logger.success('All sessions removed');
  }

  /**
   * 타임아웃된 세션 및 variant 정리
   *
   * Lazy ABR 캐시 정리:
   * 1. Variant 타임아웃 체크 (10분) - 오래 사용하지 않은 variant만 삭제
   * 2. 세션 타임아웃 체크 (30분) - 전체 세션 삭제
   * 3. 실패 기록 정리
   */
  private async cleanupTimeoutSessions(): Promise<void> {
    const now = Date.now();

    // 1. Variant 타임아웃 정리 (세션은 유지)
    for (const [mediaId, session] of this.sessions.entries()) {
      const variantsToRemove: string[] = [];

      // 각 variant의 lastSegmentTime 체크
      for (const [quality, variant] of session.variants.entries()) {
        if (now - variant.lastSegmentTime > this.variantTimeout) {
          variantsToRemove.push(quality);
        }
      }

      // 오래된 variant 정리
      for (const quality of variantsToRemove) {
        logger.info(`Cleaning up timeout variant ${quality} for ${mediaId}`);
        await this.removeVariant(mediaId, quality);
      }
    }

    // 2. 전체 세션 타임아웃 정리
    const sessionsToCleanup: string[] = [];

    for (const [mediaId, session] of this.sessions.entries()) {
      if (now - session.lastAccess > this.sessionTimeout) {
        sessionsToCleanup.push(mediaId);
      }
    }

    if (sessionsToCleanup.length > 0) {
      logger.info(`Cleaning up ${sessionsToCleanup.length} timeout session(s)`);
      for (const mediaId of sessionsToCleanup) {
        await this.removeSession(mediaId);
      }
    }

    // 3. 만료된 실패 기록도 정리
    this.cleanupExpiredFailures();
  }

  /**
   * 특정 variant만 제거
   */
  private async removeVariant(mediaId: string, quality: string): Promise<void> {
    const session = this.sessions.get(mediaId);
    if (!session) {
      return;
    }

    const variant = session.variants.get(quality);
    if (!variant) {
      return;
    }

    try {
      // FFmpeg 프로세스 종료
      await killFFmpegProcess(variant.process);

      // Variant 디렉터리 삭제
      await fs.rm(variant.outputDir, { recursive: true, force: true });

      // Map에서 제거
      session.variants.delete(quality);

      logger.success(`Removed variant ${quality} for ${mediaId}`);
    } catch (error) {
      logger.error(`Failed to remove variant ${quality} for ${mediaId}:`, error);
    }
  }

  /**
   * 정리 작업 시작 (주기적으로 실행)
   */
  private startCleanupTask(): void {
    if (this.cleanupInterval) {
      return;
    }

    // 5분마다 세션 정리 (더 빠른 리소스 회수)
    // Variant 타임아웃: 10분
    // 세션 타임아웃: 30분
    // Cleanup 주기: 5분 -> 최대 15분 내 variant 정리, 최대 35분 내 세션 정리
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupTimeoutSessions().catch(error => {
          logger.error('Failed to cleanup timeout sessions:', error);
        });
        // tombstone도 함께 정리
        this.cleanupExpiredTombstones();
      },
      5 * 60 * 1000
    );

    logger.info('Session cleanup task started (every 5 minutes)');
  }

  /**
   * 정리 작업 중지
   */
  stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Session cleanup task stopped');
    }
  }

  /**
   * 세션 통계
   */
  getStats(): { totalSessions: number; sessions: Array<{ mediaId: string; lastAccess: Date }> } {
    return {
      totalSessions: this.sessions.size,
      sessions: Array.from(this.sessions.values()).map(session => ({
        mediaId: session.mediaId,
        lastAccess: new Date(session.lastAccess),
      })),
    };
  }

  //----------------------------------------------------------------------------//
  // 실패 추적 기능
  //----------------------------------------------------------------------------//

  /**
   * 트랜스코딩 실패 기록
   */
  recordFailure(failure: Omit<TranscodingFailure, 'timestamp' | 'attemptCount'>): void {
    const existing = this.failures.get(failure.mediaId);

    const newFailure: TranscodingFailure = {
      ...failure,
      timestamp: Date.now(),
      attemptCount: existing ? existing.attemptCount + 1 : 1,
    };

    this.failures.set(failure.mediaId, newFailure);

    logger.error(`Transcoding failed for ${failure.mediaId} (attempt ${newFailure.attemptCount}): ${failure.error}`);

    if (failure.ffmpegCommand) {
      logger.debug?.(`FFmpeg command: ${failure.ffmpegCommand}`);
    }

    if (failure.ffmpegOutput) {
      logger.debug?.(`FFmpeg output:\n${failure.ffmpegOutput}`);
    }
  }

  /**
   * 최근 실패 여부 확인
   */
  hasRecentFailure(mediaId: string): TranscodingFailure | null {
    const failure = this.failures.get(mediaId);

    if (!failure) {
      return null;
    }

    // 타임아웃 체크
    if (Date.now() - failure.timestamp > this.failureTimeout) {
      this.failures.delete(mediaId);
      return null;
    }

    return failure;
  }

  /**
   * 실패 기록 초기화 (재시도 허용)
   */
  clearFailure(mediaId: string): void {
    this.failures.delete(mediaId);
    logger.info(`Cleared failure record for ${mediaId}`);
  }

  /**
   * 모든 실패 기록 조회
   */
  getAllFailures(): TranscodingFailure[] {
    return Array.from(this.failures.values());
  }

  /**
   * 만료된 실패 기록 정리
   */
  private cleanupExpiredFailures(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [mediaId, failure] of this.failures.entries()) {
      if (now - failure.timestamp > this.failureTimeout) {
        toDelete.push(mediaId);
      }
    }

    toDelete.forEach(mediaId => {
      this.failures.delete(mediaId);
      logger.info(`Cleared expired failure record for ${mediaId}`);
    });
  }

  //----------------------------------------------------------------------------//
  // 최근 중지(tombstone) 관리
  //----------------------------------------------------------------------------//

  /**
   * 최근 중지 마커 설정
   */
  markStopped(mediaId: string): void {
    this.stoppedTombstones.set(mediaId, Date.now());
  }

  /**
   * 최근에 중지되었는지 확인 (TTL 내)
   */
  isRecentlyStopped(mediaId: string): boolean {
    const ts = this.stoppedTombstones.get(mediaId);
    if (!ts) {
      return false;
    }
    const now = Date.now();
    if (now - ts <= this.stoppedTombstoneTtl) {
      return true;
    }
    this.stoppedTombstones.delete(mediaId);
    return false;
  }

  /**
   * 만료된 tombstone 정리
   */
  private cleanupExpiredTombstones(): void {
    const now = Date.now();
    for (const [mediaId, ts] of this.stoppedTombstones.entries()) {
      if (now - ts > this.stoppedTombstoneTtl) {
        this.stoppedTombstones.delete(mediaId);
      }
    }
  }
}

// 싱글톤 인스턴스
export const sessionManager = new SessionManager();
