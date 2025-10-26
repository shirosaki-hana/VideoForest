/// <reference types="node" />
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { mkdir } from 'fs/promises';
import { analyzeKeyframes } from '../services/streaming/keyframe.analyzer.js';
import { calculateAccurateSegments } from '../services/streaming/segment.calculator.js';
import { generateQualityPlaylist, generateMasterPlaylist } from '../services/streaming/playlist.generator.js';
import { generateABRProfiles, HLS_CONFIG } from '../services/streaming/transcoder/ffmpeg.config.js';
import { transcodeSegment } from '../services/streaming/jit.transcoder.js';
import { probeSegment } from '../utils/ffprobe.js';
import { detectFFprobe } from '../utils/ffprobe.js';
import { detectFFmpeg } from '../utils/ffmpeg.js';
import { logger } from '../utils/log.js';
import type { MediaInfo, MediaAnalysis, AccurateSegmentInfo } from '../services/streaming/types.js';

//------------------------------------------------------------------------------//
// ABR JIT 트랜스코딩 정확도 테스트
//
// 목표:
// 1. 키프레임 분석 → 정확한 세그먼트 계산
// 2. 구라 플레이리스트 생성
// 3. 모든 화질별 모든 세그먼트를 실제로 트랜스코딩
// 4. FFprobe로 실제 세그먼트 duration 측정
// 5. 구라 플레이리스트의 duration과 실제 세그먼트 duration 비교
//------------------------------------------------------------------------------//

interface SegmentComparisonResult {
  segmentNumber: number;
  quality: string;
  expectedDuration: number; // 플레이리스트에 명시된 duration
  actualDuration: number | null; // FFprobe로 측정한 실제 duration
  difference: number; // 차이 (초)
  percentageError: number; // 오차 퍼센트
}

interface TestReport {
  testMediaPath: string;
  totalDuration: number;
  keyframeCount: number;
  averageGopDuration: number;
  targetSegmentDuration: number;
  qualities: string[];
  totalSegments: number;
  comparisons: SegmentComparisonResult[];
  summary: {
    averageError: number;
    maxError: number;
    minError: number;
    totalTestedSegments: number;
    failedSegments: number;
  };
}

/**
 * 테스트 메인 함수
 */
async function runTranscodeAccuracyTest(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('ABR JIT 트랜스코딩 정확도 테스트');
  console.log('='.repeat(80) + '\n');

  // FFmpeg/FFprobe 확인
  console.log('🔍 FFmpeg/FFprobe 검사 중...');
  await detectFFmpeg();
  await detectFFprobe();
  console.log('✅ FFmpeg/FFprobe 준비 완료\n');

  // 테스트 미디어 경로
  const testMediaPath = path.join(process.cwd(), 'media', 'test1.mkv');
  
  if (!existsSync(testMediaPath)) {
    console.error(`❌ 테스트 미디어를 찾을 수 없습니다: ${testMediaPath}`);
    process.exit(1);
  }

  console.log(`📹 테스트 미디어: ${testMediaPath}\n`);

  // 출력 디렉토리
  const testOutputDir = path.join(process.cwd(), 'src', 'test', 'output');
  await mkdir(testOutputDir, { recursive: true });

  try {
    // 1단계: 키프레임 분석
    console.log('=' .repeat(80));
    console.log('1단계: 키프레임 분석');
    console.log('='.repeat(80) + '\n');
    
    const keyframeAnalysis = await analyzeKeyframes(testMediaPath);
    
    console.log(`✅ 키프레임 분석 완료`);
    console.log(`   - 총 키프레임: ${keyframeAnalysis.totalKeyframes}개`);
    console.log(`   - 평균 GOP 크기: ${keyframeAnalysis.averageGopSize} 프레임`);
    console.log(`   - 평균 GOP 시간: ${keyframeAnalysis.averageGopDuration.toFixed(3)}초`);
    console.log(`   - 전체 재생시간: ${keyframeAnalysis.totalDuration.toFixed(3)}초`);
    console.log(`   - FPS: ${keyframeAnalysis.fps.toFixed(2)}\n`);

    // 2단계: 정확한 세그먼트 계산
    console.log('='.repeat(80));
    console.log('2단계: 정확한 세그먼트 계산');
    console.log('='.repeat(80) + '\n');

    const targetSegmentDuration = HLS_CONFIG.segmentTime;
    const segmentCalculation = calculateAccurateSegments(
      keyframeAnalysis.keyframes,
      targetSegmentDuration,
      keyframeAnalysis.totalDuration
    );

    console.log(`✅ 세그먼트 계산 완료`);
    console.log(`   - 목표 세그먼트 길이: ${targetSegmentDuration}초`);
    console.log(`   - 총 세그먼트 개수: ${segmentCalculation.totalSegments}개`);
    console.log(`   - 평균 세그먼트 길이: ${segmentCalculation.averageSegmentDuration.toFixed(3)}초`);
    console.log(`   - 최소 세그먼트 길이: ${segmentCalculation.minSegmentDuration.toFixed(3)}초`);
    console.log(`   - 최대 세그먼트 길이: ${segmentCalculation.maxSegmentDuration.toFixed(3)}초\n`);

    // 3단계: 구라 플레이리스트 생성
    console.log('='.repeat(80));
    console.log('3단계: 구라 플레이리스트 생성');
    console.log('='.repeat(80) + '\n');

    // 미디어 정보 (테스트용 임의 값)
    const mediaInfo: MediaInfo = {
      width: 1920,
      height: 1080,
      duration: keyframeAnalysis.totalDuration,
      codec: 'h264',
      audioCodec: 'aac',
      fps: keyframeAnalysis.fps,
      bitrate: 5000000,
    };

    const availableProfiles = generateABRProfiles(mediaInfo);
    console.log(`📊 생성된 화질 프로파일: ${availableProfiles.map(p => p.name).join(', ')}\n`);

    // Master Playlist 생성
    const masterPlaylist = generateMasterPlaylist(availableProfiles);
    console.log('Master Playlist:');
    console.log('─'.repeat(80));
    console.log(masterPlaylist);
    console.log('─'.repeat(80) + '\n');

    // 각 화질별 플레이리스트 생성 및 파싱
    const playlistsByQuality = new Map<string, AccurateSegmentInfo[]>();

    for (const profile of availableProfiles) {
      const qualityPlaylist = generateQualityPlaylist(
        keyframeAnalysis.totalDuration,
        targetSegmentDuration,
        segmentCalculation.segments
      );

      console.log(`\n${profile.name} Playlist (처음 10개 세그먼트):`);
      console.log('─'.repeat(80));
      const lines = qualityPlaylist.split('\n').slice(0, 30);
      console.log(lines.join('\n'));
      console.log('─'.repeat(80));

      // 플레이리스트 저장 (나중에 검증용)
      playlistsByQuality.set(profile.name, segmentCalculation.segments);
    }

    // 4단계: 모든 화질별 모든 세그먼트 트랜스코딩
    console.log('\n' + '='.repeat(80));
    console.log('4단계: 모든 세그먼트 트랜스코딩 (시간이 오래 걸릴 수 있습니다)');
    console.log('='.repeat(80) + '\n');

    const analysis: MediaAnalysis = {
      canDirectCopy: false,
      needsVideoTranscode: true,
      needsAudioTranscode: false,
      hasAudio: true,
      compatibilityIssues: [],
      recommendedProfile: availableProfiles[0],
      segmentDuration: targetSegmentDuration,
      totalSegments: segmentCalculation.totalSegments,
      inputFormat: {
        videoCodec: 'h264',
        audioCodec: 'aac',
        width: 1920,
        height: 1080,
        fps: keyframeAnalysis.fps,
      },
    };

    const comparisons: SegmentComparisonResult[] = [];
    let transcodeCount = 0;
    const totalTranscodes = availableProfiles.length * segmentCalculation.totalSegments;

    for (const profile of availableProfiles) {
      console.log(`\n🎬 ${profile.name} 트랜스코딩 시작...`);
      
      const qualityDir = path.join(testOutputDir, profile.name);
      await mkdir(qualityDir, { recursive: true });

      for (const segment of segmentCalculation.segments) {
        transcodeCount++;
        const outputPath = path.join(qualityDir, segment.fileName);

        console.log(
          `   [${transcodeCount}/${totalTranscodes}] ` +
          `세그먼트 ${segment.segmentNumber.toString().padStart(3, '0')} ` +
          `(${segment.startTime.toFixed(3)}s ~ ${segment.endTime.toFixed(3)}s, ` +
          `예상 ${segment.duration.toFixed(3)}초)...`
        );

        // 트랜스코딩 실행
        const success = await transcodeSegment(
          testMediaPath,
          segment,
          profile,
          analysis,
          outputPath
        );

        if (!success) {
          console.error(`   ❌ 트랜스코딩 실패!`);
          comparisons.push({
            segmentNumber: segment.segmentNumber,
            quality: profile.name,
            expectedDuration: segment.duration,
            actualDuration: null,
            difference: 0,
            percentageError: 0,
          });
          continue;
        }

        // 5단계: 실제 세그먼트 duration 측정
        const probeResult = await probeSegment(outputPath);
        const actualDuration = probeResult.duration;

        if (actualDuration === null) {
          console.error(`   ❌ FFprobe 실패!`);
          comparisons.push({
            segmentNumber: segment.segmentNumber,
            quality: profile.name,
            expectedDuration: segment.duration,
            actualDuration: null,
            difference: 0,
            percentageError: 0,
          });
          continue;
        }

        const difference = Math.abs(actualDuration - segment.duration);
        const percentageError = (difference / segment.duration) * 100;

        console.log(
          `   ✅ 완료! ` +
          `실제: ${actualDuration.toFixed(3)}초, ` +
          `차이: ${difference.toFixed(3)}초 (${percentageError.toFixed(2)}%)`
        );

        comparisons.push({
          segmentNumber: segment.segmentNumber,
          quality: profile.name,
          expectedDuration: segment.duration,
          actualDuration,
          difference,
          percentageError,
        });
      }

      console.log(`✅ ${profile.name} 트랜스코딩 완료\n`);
    }

    // 6단계: 최종 리포트 생성
    console.log('\n' + '='.repeat(80));
    console.log('6단계: 비교 리포트');
    console.log('='.repeat(80) + '\n');

    generateReport({
      testMediaPath,
      totalDuration: keyframeAnalysis.totalDuration,
      keyframeCount: keyframeAnalysis.totalKeyframes,
      averageGopDuration: keyframeAnalysis.averageGopDuration,
      targetSegmentDuration,
      qualities: availableProfiles.map(p => p.name),
      totalSegments: segmentCalculation.totalSegments,
      comparisons,
      summary: calculateSummary(comparisons),
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ 테스트 완료!');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ 테스트 중 오류 발생:', error);
    process.exit(1);
  }
}

/**
 * 요약 통계 계산
 */
function calculateSummary(comparisons: SegmentComparisonResult[]) {
  const validComparisons = comparisons.filter(c => c.actualDuration !== null);
  const errors = validComparisons.map(c => c.difference);
  
  return {
    averageError: errors.length > 0 ? errors.reduce((a, b) => a + b, 0) / errors.length : 0,
    maxError: errors.length > 0 ? Math.max(...errors) : 0,
    minError: errors.length > 0 ? Math.min(...errors) : 0,
    totalTestedSegments: validComparisons.length,
    failedSegments: comparisons.filter(c => c.actualDuration === null).length,
  };
}

/**
 * 최종 리포트 출력
 */
function generateReport(report: TestReport): void {
  console.log('📊 테스트 결과 요약');
  console.log('─'.repeat(80));
  console.log(`테스트 미디어:        ${path.basename(report.testMediaPath)}`);
  console.log(`전체 재생시간:        ${report.totalDuration.toFixed(3)}초`);
  console.log(`키프레임 개수:        ${report.keyframeCount}개`);
  console.log(`평균 GOP 시간:        ${report.averageGopDuration.toFixed(3)}초`);
  console.log(`목표 세그먼트 길이:   ${report.targetSegmentDuration}초`);
  console.log(`테스트 화질:          ${report.qualities.join(', ')}`);
  console.log(`총 세그먼트 개수:     ${report.totalSegments}개`);
  console.log(`총 테스트 세그먼트:   ${report.summary.totalTestedSegments}개`);
  console.log(`실패한 세그먼트:      ${report.summary.failedSegments}개`);
  console.log('─'.repeat(80));
  console.log(`평균 오차:            ${report.summary.averageError.toFixed(3)}초`);
  console.log(`최대 오차:            ${report.summary.maxError.toFixed(3)}초`);
  console.log(`최소 오차:            ${report.summary.minError.toFixed(3)}초`);
  console.log('─'.repeat(80) + '\n');

  // 화질별 통계
  for (const quality of report.qualities) {
    const qualityComparisons = report.comparisons.filter(c => c.quality === quality && c.actualDuration !== null);
    
    if (qualityComparisons.length === 0) continue;

    const avgError = qualityComparisons.reduce((sum, c) => sum + c.difference, 0) / qualityComparisons.length;
    const maxError = Math.max(...qualityComparisons.map(c => c.difference));
    const avgPercentError = qualityComparisons.reduce((sum, c) => sum + c.percentageError, 0) / qualityComparisons.length;

    console.log(`\n📈 ${quality} 상세 통계:`);
    console.log('─'.repeat(80));
    console.log(`평균 오차:            ${avgError.toFixed(3)}초 (${avgPercentError.toFixed(2)}%)`);
    console.log(`최대 오차:            ${maxError.toFixed(3)}초`);
    console.log('─'.repeat(80));

    // 오차가 큰 세그먼트 표시 (상위 5개)
    const topErrors = [...qualityComparisons]
      .sort((a, b) => b.difference - a.difference)
      .slice(0, 5);

    if (topErrors.length > 0 && topErrors[0].difference > 0.1) {
      console.log(`\n⚠️  오차가 큰 세그먼트 (상위 ${Math.min(5, topErrors.length)}개):`);
      console.log('─'.repeat(80));
      console.log('세그번호   예상(초)   실제(초)   차이(초)   오차(%)');
      console.log('─'.repeat(80));
      
      for (const seg of topErrors) {
        console.log(
          `  ${seg.segmentNumber.toString().padStart(3, '0')}      ` +
          `${seg.expectedDuration.toFixed(3).padStart(7)}   ` +
          `${seg.actualDuration!.toFixed(3).padStart(7)}   ` +
          `${seg.difference.toFixed(3).padStart(7)}   ` +
          `${seg.percentageError.toFixed(2).padStart(6)}%`
        );
      }
      console.log('─'.repeat(80));
    }
  }

  // 전체 세그먼트 비교 테이블 (처음 10개만)
  console.log(`\n\n📋 세그먼트 비교 (처음 10개):`);
  console.log('─'.repeat(80));
  console.log('화질     세그번호   예상(초)   실제(초)   차이(초)   오차(%)');
  console.log('─'.repeat(80));

  const firstTenValid = report.comparisons
    .filter(c => c.actualDuration !== null)
    .slice(0, 10);

  for (const seg of firstTenValid) {
    console.log(
      `${seg.quality.padEnd(8)} ` +
      `${seg.segmentNumber.toString().padStart(3, '0')}      ` +
      `${seg.expectedDuration.toFixed(3).padStart(7)}   ` +
      `${seg.actualDuration!.toFixed(3).padStart(7)}   ` +
      `${seg.difference.toFixed(3).padStart(7)}   ` +
      `${seg.percentageError.toFixed(2).padStart(6)}%`
    );
  }
  console.log('─'.repeat(80));
}

// 메인 실행
runTranscodeAccuracyTest().catch((error) => {
  console.error('치명적 오류:', error);
  process.exit(1);
});

