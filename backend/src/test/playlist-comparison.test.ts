/// <reference types="node" />
import path from 'path';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { analyzeKeyframes } from '../services/streaming/keyframe.analyzer.js';
import { calculateAccurateSegments } from '../services/streaming/segment.calculator.js';
import { generateQualityPlaylist } from '../services/streaming/playlist.generator.js';
import { generateABRProfiles, HLS_CONFIG } from '../services/streaming/transcoder/ffmpeg.config.js';
import { transcodeSegment } from '../services/streaming/jit.transcoder.js';
import { probeSegment } from '../utils/ffprobe.js';
import { detectFFprobe } from '../utils/ffprobe.js';
import { detectFFmpeg } from '../utils/ffmpeg.js';
import type { MediaInfo, MediaAnalysis, AccurateSegmentInfo } from '../services/streaming/types.js';

//------------------------------------------------------------------------------//
// 플레이리스트 비교 테스트 (프로덕션 JIT 트랜스코더 사용)
//
// 목표:
// 1. 키프레임 분석 → 정확한 세그먼트 계산 → **구라 플레이리스트** 생성
// 2. **실제 JIT 트랜스코더**로 모든 세그먼트 생성
// 3. FFprobe로 각 세그먼트의 실제 duration 측정
// 4. 실제 duration 기반으로 **실제 플레이리스트** 생성
// 5. 구라 vs 실제 플레이리스트 비교
//    - 세그먼트 개수
//    - 각 세그먼트의 duration
//    - TARGETDURATION
//------------------------------------------------------------------------------//

interface PlaylistSegment {
  segmentNumber: number;
  duration: number;
  fileName: string;
}

interface PlaylistInfo {
  version: number;
  targetDuration: number;
  mediaSequence: number;
  playlistType: string;
  segments: PlaylistSegment[];
}

interface ComparisonResult {
  quality: string;
  predicted: PlaylistInfo;
  ffmpegGenerated: PlaylistInfo;
  differences: {
    segmentCountMatch: boolean;
    targetDurationMatch: boolean;
    segmentDurations: {
      segmentNumber: number;
      predictedDuration: number;
      ffmpegDuration: number;
      difference: number;
      percentageError: number;
    }[];
  };
}

/**
 * HLS 플레이리스트 파싱
 */
function parsePlaylist(playlistContent: string): PlaylistInfo {
  const lines = playlistContent.split('\n').map(line => line.trim()).filter(line => line);
  
  const info: PlaylistInfo = {
    version: 3,
    targetDuration: 0,
    mediaSequence: 0,
    playlistType: 'VOD',
    segments: [],
  };

  let currentDuration = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('#EXT-X-VERSION:')) {
      info.version = parseInt(line.split(':')[1]);
    } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      info.targetDuration = parseInt(line.split(':')[1]);
    } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      info.mediaSequence = parseInt(line.split(':')[1]);
    } else if (line.startsWith('#EXT-X-PLAYLIST-TYPE:')) {
      info.playlistType = line.split(':')[1];
    } else if (line.startsWith('#EXTINF:')) {
      // #EXTINF:6.000,
      const durationMatch = line.match(/#EXTINF:([\d.]+),/);
      if (durationMatch) {
        currentDuration = parseFloat(durationMatch[1]);
      }
    } else if (line.endsWith('.ts') && currentDuration > 0) {
      // segment_000.ts
      const segmentMatch = line.match(/segment_(\d+)\.ts/);
      const segmentNumber = segmentMatch ? parseInt(segmentMatch[1]) : info.segments.length;
      
      info.segments.push({
        segmentNumber,
        duration: currentDuration,
        fileName: line,
      });
      
      currentDuration = 0;
    }
  }
  
  return info;
}

/**
 * 실제 JIT 트랜스코더로 모든 세그먼트 생성 및 실제 플레이리스트 생성
 */
async function transcodeAllSegmentsWithJIT(
  mediaPath: string,
  segments: AccurateSegmentInfo[],
  profile: any,
  analysis: MediaAnalysis,
  outputDir: string
): Promise<{ playlist: string; actualSegments: AccurateSegmentInfo[] }> {
  await mkdir(outputDir, { recursive: true });
  
  console.log(`🎬 실제 JIT 트랜스코딩 시작: ${profile.name}`);
  console.log(`   총 ${segments.length}개 세그먼트를 트랜스코딩합니다...`);
  
  const actualSegments: AccurateSegmentInfo[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const outputPath = path.join(outputDir, segment.fileName);
    
    console.log(
      `   [${i + 1}/${segments.length}] ` +
      `세그먼트 ${segment.segmentNumber.toString().padStart(3, '0')} ` +
      `(${segment.startTime.toFixed(3)}s ~ ${segment.endTime.toFixed(3)}s) ` +
      `트랜스코딩 중...`
    );
    
    // 실제 JIT 트랜스코더 사용!
    const success = await transcodeSegment(
      mediaPath,
      segment,
      profile,
      analysis,
      outputPath
    );
    
    if (!success) {
      console.error(`   ❌ 세그먼트 ${segment.segmentNumber} 트랜스코딩 실패`);
      continue;
    }
    
    // FFprobe로 실제 duration 측정
    const probeResult = await probeSegment(outputPath);
    const actualDuration = probeResult.duration;
    
    if (actualDuration === null) {
      console.error(`   ❌ 세그먼트 ${segment.segmentNumber} FFprobe 실패`);
      continue;
    }
    
    console.log(`   ✅ 완료! 실제 duration: ${actualDuration.toFixed(3)}초`);
    
    // 실제 duration으로 세그먼트 정보 업데이트
    actualSegments.push({
      ...segment,
      duration: actualDuration,
    });
  }
  
  console.log(`\n✅ 모든 세그먼트 트랜스코딩 완료: ${actualSegments.length}/${segments.length}개 성공\n`);
  
  // 실제 duration 기반 플레이리스트 생성
  const lines: string[] = [];
  const maxDuration = Math.max(...actualSegments.map(s => s.duration));
  const targetDuration = Math.ceil(maxDuration);
  
  lines.push('#EXTM3U');
  lines.push('#EXT-X-VERSION:3');
  lines.push(`#EXT-X-TARGETDURATION:${targetDuration}`);
  lines.push('#EXT-X-MEDIA-SEQUENCE:0');
  lines.push('#EXT-X-PLAYLIST-TYPE:VOD');
  lines.push('');
  
  for (const segment of actualSegments) {
    lines.push(`#EXTINF:${segment.duration.toFixed(3)},`);
    lines.push(segment.fileName);
  }
  
  lines.push('#EXT-X-ENDLIST');
  
  const playlistContent = lines.join('\n');
  
  // 플레이리스트 저장
  const playlistPath = path.join(outputDir, 'playlist.m3u8');
  await writeFile(playlistPath, playlistContent);
  
  return {
    playlist: playlistContent,
    actualSegments,
  };
}

/**
 * 메인 테스트 실행
 */
async function runPlaylistComparisonTest(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('플레이리스트 비교 테스트: 구라 vs FFmpeg');
  console.log('='.repeat(80) + '\n');

  // FFmpeg/FFprobe 확인
  console.log('🔍 FFmpeg/FFprobe 검사 중...');
  await detectFFmpeg();
  await detectFFprobe();
  console.log('✅ FFmpeg/FFprobe 준비 완료\n');

  // 테스트 미디어 경로
  const testMediaPath = path.join(process.cwd(), 'media/BBB', 'BigBuckBunny_320x180.mp4');
  
  if (!existsSync(testMediaPath)) {
    console.error(`❌ 테스트 미디어를 찾을 수 없습니다: ${testMediaPath}`);
    process.exit(1);
  }

  console.log(`📹 테스트 미디어: ${testMediaPath}\n`);

  // 출력 디렉토리
  const testOutputDir = path.join(process.cwd(), 'src', 'test', 'output', 'playlist-comparison');
  await mkdir(testOutputDir, { recursive: true });

  try {
    // 1단계: 키프레임 분석
    console.log('='.repeat(80));
    console.log('1단계: 키프레임 분석');
    console.log('='.repeat(80) + '\n');
    
    const keyframeAnalysis = await analyzeKeyframes(testMediaPath);
    
    console.log(`✅ 키프레임 분석 완료`);
    console.log(`   - 총 키프레임: ${keyframeAnalysis.totalKeyframes}개`);
    console.log(`   - 평균 GOP 시간: ${keyframeAnalysis.averageGopDuration.toFixed(3)}초`);
    console.log(`   - 전체 재생시간: ${keyframeAnalysis.totalDuration.toFixed(3)}초\n`);

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
    console.log(`   - 총 세그먼트 개수: ${segmentCalculation.totalSegments}개\n`);

    // 3단계: 구라 플레이리스트 생성
    console.log('='.repeat(80));
    console.log('3단계: 구라 플레이리스트 생성');
    console.log('='.repeat(80) + '\n');

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
    
    // 테스트는 720p만 진행 (시간 절약)
    const testProfile = availableProfiles.find(p => p.name === '720p') || availableProfiles[0];
    console.log(`📊 테스트 화질: ${testProfile.name}\n`);

    const predictedPlaylist = generateQualityPlaylist(
      keyframeAnalysis.totalDuration,
      targetSegmentDuration,
      segmentCalculation.segments
    );

    const predictedPlaylistPath = path.join(testOutputDir, 'predicted', testProfile.name, 'playlist.m3u8');
    await mkdir(path.dirname(predictedPlaylistPath), { recursive: true });
    await writeFile(predictedPlaylistPath, predictedPlaylist);

    console.log(`✅ 구라 플레이리스트 저장: ${predictedPlaylistPath}\n`);
    console.log('구라 플레이리스트 내용:');
    console.log('─'.repeat(80));
    console.log(predictedPlaylist);
    console.log('─'.repeat(80) + '\n');

    // 4단계: 실제 JIT 트랜스코더로 모든 세그먼트 생성
    console.log('='.repeat(80));
    console.log('4단계: 실제 JIT 트랜스코더로 모든 세그먼트 트랜스코딩');
    console.log('='.repeat(80) + '\n');

    const analysis: MediaAnalysis = {
      canDirectCopy: false,
      needsVideoTranscode: true,
      needsAudioTranscode: false,
      hasAudio: true,
      compatibilityIssues: [],
      recommendedProfile: testProfile,
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

    const actualOutputDir = path.join(testOutputDir, 'actual', testProfile.name);
    const { playlist: actualPlaylist, actualSegments } = await transcodeAllSegmentsWithJIT(
      testMediaPath,
      segmentCalculation.segments,
      testProfile,
      analysis,
      actualOutputDir
    );

    console.log('실제 플레이리스트 내용 (JIT 트랜스코더):');
    console.log('─'.repeat(80));
    console.log(actualPlaylist);
    console.log('─'.repeat(80) + '\n');

    // 5단계: 플레이리스트 파싱 및 비교
    console.log('='.repeat(80));
    console.log('5단계: 구라 vs 실제 플레이리스트 비교');
    console.log('='.repeat(80) + '\n');

    const predictedInfo = parsePlaylist(predictedPlaylist);
    const actualInfo = parsePlaylist(actualPlaylist);

    console.log('📊 기본 정보 비교:');
    console.log('─'.repeat(80));
    console.log(`구분                     구라 플레이리스트    실제 플레이리스트 (JIT)`);
    console.log('─'.repeat(80));
    console.log(`HLS 버전                 ${predictedInfo.version}                    ${actualInfo.version}`);
    console.log(`TARGETDURATION           ${predictedInfo.targetDuration}                    ${actualInfo.targetDuration}`);
    console.log(`세그먼트 개수            ${predictedInfo.segments.length}                    ${actualInfo.segments.length}`);
    console.log('─'.repeat(80) + '\n');

    // 세그먼트별 duration 비교
    console.log('📋 세그먼트 duration 비교:');
    console.log('─'.repeat(80));
    console.log('세그#   구라(초)   실제(초)   차이(초)   오차(%)');
    console.log('─'.repeat(80));

    const segmentDiffs: {
      segmentNumber: number;
      predictedDuration: number;
      actualDuration: number;
      difference: number;
      percentageError: number;
    }[] = [];
    const minLength = Math.min(predictedInfo.segments.length, actualInfo.segments.length);

    for (let i = 0; i < minLength; i++) {
      const predicted = predictedInfo.segments[i];
      const actual = actualInfo.segments[i];
      
      const difference = Math.abs(predicted.duration - actual.duration);
      const percentageError = (difference / actual.duration) * 100;
      
      segmentDiffs.push({
        segmentNumber: i,
        predictedDuration: predicted.duration,
        actualDuration: actual.duration,
        difference,
        percentageError,
      });

      console.log(
        `${i.toString().padStart(4, ' ')}    ` +
        `${predicted.duration.toFixed(3).padStart(8)}   ` +
        `${actual.duration.toFixed(3).padStart(8)}   ` +
        `${difference.toFixed(3).padStart(8)}   ` +
        `${percentageError.toFixed(2).padStart(7)}%`
      );
    }

    console.log('─'.repeat(80) + '\n');

    // 통계
    const avgError = segmentDiffs.reduce((sum, d) => sum + d.difference, 0) / segmentDiffs.length;
    const maxError = Math.max(...segmentDiffs.map((d) => d.difference));
    const avgPercentError = segmentDiffs.reduce((sum, d) => sum + d.percentageError, 0) / segmentDiffs.length;

    console.log('📈 오차 통계:');
    console.log('─'.repeat(80));
    console.log(`평균 오차:     ${avgError.toFixed(3)}초 (${avgPercentError.toFixed(2)}%)`);
    console.log(`최대 오차:     ${maxError.toFixed(3)}초`);
    console.log('─'.repeat(80) + '\n');

    // 오차가 큰 세그먼트 표시
    const topErrors = [...segmentDiffs]
      .sort((a, b) => b.difference - a.difference)
      .slice(0, 5);

    if (topErrors.length > 0 && topErrors[0].difference > 0.1) {
      console.log('⚠️  오차가 큰 세그먼트 (상위 5개):');
      console.log('─'.repeat(80));
      console.log('세그#   구라(초)   실제(초)   차이(초)   오차(%)');
      console.log('─'.repeat(80));
      
      for (const seg of topErrors) {
        console.log(
          `${seg.segmentNumber.toString().padStart(4, ' ')}    ` +
          `${seg.predictedDuration.toFixed(3).padStart(8)}   ` +
          `${seg.actualDuration.toFixed(3).padStart(8)}   ` +
          `${seg.difference.toFixed(3).padStart(8)}   ` +
          `${seg.percentageError.toFixed(2).padStart(7)}%`
        );
      }
      console.log('─'.repeat(80) + '\n');
    }

    // 결론
    console.log('='.repeat(80));
    console.log('✅ 테스트 완료!');
    console.log('='.repeat(80) + '\n');

    console.log('💡 결론:');
    console.log(`   - 세그먼트 개수 일치: ${predictedInfo.segments.length === actualInfo.segments.length ? '✅ 예' : '❌ 아니오'}`);
    console.log(`   - TARGETDURATION 일치: ${predictedInfo.targetDuration === actualInfo.targetDuration ? '✅ 예' : '❌ 아니오'}`);
    console.log(`   - 평균 duration 오차: ${avgError.toFixed(3)}초 (${avgPercentError.toFixed(2)}%)`);
    
    if (avgPercentError < 1) {
      console.log(`   - ✅ 오차가 1% 미만으로 매우 정확합니다!`);
    } else if (avgPercentError < 5) {
      console.log(`   - ⚠️  오차가 있지만 실용적 수준입니다.`);
    } else {
      console.log(`   - ❌ 오차가 너무 큽니다. 알고리즘 개선이 필요합니다.`);
    }
    
    console.log('\n💬 분석:');
    console.log(`   이 테스트는 실제 프로덕션 JIT 트랜스코더를 사용합니다.`);
    console.log(`   키프레임 분석으로 예측한 duration과 실제 트랜스코딩된 세그먼트의 duration을 비교합니다.`);
    console.log(`   오차가 크다면 키프레임 분석 또는 세그먼트 계산 알고리즘을 개선해야 합니다.`);
    console.log('');

  } catch (error) {
    console.error('\n❌ 테스트 중 오류 발생:', error);
    process.exit(1);
  }
}

// 메인 실행
runPlaylistComparisonTest().catch((error) => {
  console.error('치명적 오류:', error);
  process.exit(1);
});

