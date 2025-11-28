import path from 'path';
import type { SegmentInfo } from '../types.js';
import { env } from '../../config/index.js';
//------------------------------------------------------------------------------//

/**
 * 세그먼트 관련 유틸리티 함수 모음
 *
 * 책임:
 * - 세그먼트 번호/시간 변환
 * - 파일명 생성/파싱
 * - 경로 생성
 * - 세그먼트 정보 객체 생성
 */
export class SegmentUtils {
  /**
   * 세그먼트 번호 → 시작 시간 변환
   */
  static getStartTime(segmentNumber: number, segmentDuration: number): number {
    return segmentNumber * segmentDuration;
  }

  /**
   * 시간 → 세그먼트 번호 변환
   */
  static getNumberFromTime(time: number, segmentDuration: number): number {
    return Math.floor(time / segmentDuration);
  }

  /**
   * 전체 세그먼트 개수 계산
   */
  static calculateTotalSegments(duration: number, segmentDuration: number): number {
    return Math.ceil(duration / segmentDuration);
  }

  /**
   * 세그먼트 파일명 생성
   */
  static getFileName(segmentNumber: number): string {
    return `segment_${segmentNumber.toString().padStart(3, '0')}.ts`;
  }

  /**
   * 세그먼트 파일명 → 번호 추출
   */
  static parseNumber(fileName: string): number | null {
    const match = fileName.match(/segment_(\d+)\.ts/);
    if (!match) {
      return null;
    }
    return parseInt(match[1], 10);
  }

  /**
   * 세그먼트 전체 경로 생성
   */
  static getPath(mediaId: string, quality: string, segmentNumber: number, baseDir: string = env.HLS_TEMP_DIR): string {
    const fileName = this.getFileName(segmentNumber);
    return path.join(baseDir, mediaId, quality, fileName);
  }

  /**
   * 화질별 디렉터리 경로
   */
  static getQualityDir(mediaId: string, quality: string, baseDir: string = env.HLS_TEMP_DIR): string {
    return path.join(baseDir, mediaId, quality);
  }

  /**
   * 미디어 루트 디렉터리 경로
   */
  static getMediaDir(mediaId: string, baseDir: string = env.HLS_TEMP_DIR): string {
    return path.join(baseDir, mediaId);
  }

  /**
   * 플레이리스트 경로
   */
  static getPlaylistPath(mediaId: string, quality: string | 'master', baseDir: string = env.HLS_TEMP_DIR): string {
    if (quality === 'master') {
      return path.join(baseDir, mediaId, 'master.m3u8');
    }
    return path.join(baseDir, mediaId, quality, 'playlist.m3u8');
  }

  /**
   * 세그먼트 정보 생성
   */
  static createInfo(segmentNumber: number, segmentDuration: number, totalDuration: number): SegmentInfo {
    const startTime = this.getStartTime(segmentNumber, segmentDuration);

    // 마지막 세그먼트는 남은 시간만큼만
    const duration = Math.min(segmentDuration, totalDuration - startTime);

    return {
      segmentNumber,
      startTime,
      duration,
      fileName: this.getFileName(segmentNumber),
    };
  }

  /**
   * 모든 세그먼트 정보 생성 (플레이리스트용)
   */
  static createAllInfos(totalDuration: number, segmentDuration: number): SegmentInfo[] {
    const totalSegments = this.calculateTotalSegments(totalDuration, segmentDuration);
    const segments: SegmentInfo[] = [];

    for (let i = 0; i < totalSegments; i++) {
      segments.push(this.createInfo(i, segmentDuration, totalDuration));
    }

    return segments;
  }
}
