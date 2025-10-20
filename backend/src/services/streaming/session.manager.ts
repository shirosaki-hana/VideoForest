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
  private failures = new Map<string, TranscodingFailure>();
  private readonly sessionTimeout: number;
  private readonly failureTimeout: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    sessionTimeout: number = 5 * 60 * 1000,
    failureTimeout: number = 10 * 60 * 1000  // 10분간 실패 기록 유지
  ) {
    this.sessionTimeout = sessionTimeout;
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
   * 세션 존재 여부 확인
   */
  hasSession(mediaId: string): boolean {
    return this.sessions.has(mediaId);
  }

  /**
   * 세션 삭제
   */
  async removeSession(mediaId: string): Promise<void> {
    const session = this.sessions.get(mediaId);
    if (!session) {
      return;
    }

    logger.info(`Removing session for media ${mediaId}`);

    // FFmpeg 프로세스 종료
    try {
      await killFFmpegProcess(session.process);
    } catch (error) {
      logger.error(`Failed to kill FFmpeg process for ${mediaId}:`, error);
    }

    // 출력 디렉터리 삭제
    try {
      await fs.rm(session.outputDir, { recursive: true, force: true });
    } catch (error) {
      logger.error(`Failed to remove output directory for ${mediaId}:`, error);
    }

    this.sessions.delete(mediaId);
    logger.success(`Session removed for media ${mediaId}`);
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
   * 타임아웃된 세션 및 만료된 실패 기록 정리
   */
  private async cleanupTimeoutSessions(): Promise<void> {
    const now = Date.now();
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

    // 만료된 실패 기록도 정리
    this.cleanupExpiredFailures();
  }

  /**
   * 정리 작업 시작 (주기적으로 실행)
   */
  private startCleanupTask(): void {
    if (this.cleanupInterval) {
      return;
    }

    // 10분마다 세션 정리
    this.cleanupInterval = setInterval(() => {
      this.cleanupTimeoutSessions().catch(error => {
        logger.error('Failed to cleanup timeout sessions:', error);
      });
    }, 10 * 60 * 1000);

    logger.info('Session cleanup task started');
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
}

// 싱글톤 인스턴스
export const sessionManager = new SessionManager();

