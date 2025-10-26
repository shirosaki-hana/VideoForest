/**
 * NVENC 가용성 테스트 스크립트
 * 
 * 실행 방법:
 *   npx tsx test-nvenc.ts
 */

import { spawn } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const ffmpegPath = ffmpegInstaller.path;

console.log('='.repeat(60));
console.log('🔍 NVENC 가용성 테스트');
console.log('='.repeat(60));
console.log(`FFmpeg 경로: ${ffmpegPath}\n`);

// 1단계: FFmpeg 버전 확인
console.log('📌 1단계: FFmpeg 버전 확인');
const versionProcess = spawn(ffmpegPath, ['-version']);
let versionOutput = '';

versionProcess.stdout.on('data', (data) => {
  versionOutput += data.toString();
});

versionProcess.on('close', () => {
  const firstLine = versionOutput.split('\n')[0];
  console.log(`   ${firstLine}\n`);
  
  // 2단계: 사용 가능한 인코더 확인
  console.log('📌 2단계: H.264 인코더 확인');
  checkEncoders();
});

function checkEncoders() {
  const encodersProcess = spawn(ffmpegPath, ['-hide_banner', '-encoders']);
  let encodersOutput = '';
  
  encodersProcess.stdout.on('data', (data) => {
    encodersOutput += data.toString();
  });
  
  encodersProcess.on('close', () => {
    const h264Encoders = encodersOutput
      .split('\n')
      .filter(line => line.includes('h264') || line.includes('H.264'))
      .map(line => line.trim());
    
    if (h264Encoders.length === 0) {
      console.log('   ❌ H.264 인코더를 찾을 수 없습니다.\n');
    } else {
      h264Encoders.forEach(encoder => {
        const hasNvenc = encoder.includes('nvenc');
        const prefix = hasNvenc ? '   ✅' : '   ⚪';
        console.log(`${prefix} ${encoder}`);
      });
      console.log();
    }
    
    const hasNvenc = encodersOutput.includes('nvenc');
    
    if (hasNvenc) {
      console.log('✨ NVENC 인코더 발견! 실제 인코딩 테스트를 시작합니다...\n');
      testNvencEncoding();
    } else {
      console.log('⚠️  NVENC 인코더가 발견되지 않았습니다.');
      console.log('    이유:');
      console.log('    1. 번들된 FFmpeg가 NVENC 지원 없이 컴파일됨 (가장 흔한 원인)');
      console.log('    2. NVIDIA GPU가 없거나 드라이버 미설치\n');
      console.log('💡 해결 방법:');
      console.log('    - NVENC 지원 FFmpeg를 별도로 설치하세요.');
      console.log('    - 추천: https://www.gyan.dev/ffmpeg/builds/ (full 빌드)\n');
      
      // CPU 인코더 테스트
      console.log('📌 3단계: CPU 인코더 (libx264) 테스트');
      testCpuEncoding();
    }
  });
}

function testNvencEncoding() {
  console.log('📌 3단계: NVENC 실제 인코딩 테스트');
  console.log('   (1초짜리 더미 비디오를 NVENC로 인코딩...)');
  
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', 'color=black:s=256x144:d=1',
    '-c:v', 'h264_nvenc',
    '-preset', 'p1',
    '-b:v', '100k',
    '-f', 'null',
    '-'
  ];
  
  const testProcess = spawn(ffmpegPath, args);
  let stderr = '';
  
  testProcess.stderr.on('data', (data) => {
    stderr += data.toString();
  });
  
  const timeout = setTimeout(() => {
    testProcess.kill();
    console.log('   ⏱️  타임아웃 (5초)');
    console.log('   ❌ NVENC 인코딩 실패\n');
    printConclusion(false);
  }, 5000);
  
  testProcess.on('close', (code) => {
    clearTimeout(timeout);
    
    if (code === 0) {
      console.log('   ✅ 성공!\n');
      printConclusion(true);
    } else {
      console.log(`   ❌ 실패 (exit code: ${code})`);
      
      if (stderr) {
        console.log('\n   에러 메시지:');
        const errorLines = stderr.split('\n').filter(line => line.trim());
        errorLines.forEach(line => {
          console.log(`   ${line.trim()}`);
        });
        
        console.log('\n   분석:');
        if (stderr.includes('No NVENC capable devices found')) {
          console.log('   - NVIDIA GPU를 찾을 수 없습니다.');
          console.log('   - Quadro P620이 있다면 드라이버를 확인하세요.');
        } else if (stderr.includes('Cannot load')) {
          console.log('   - NVENC 라이브러리를 로드할 수 없습니다.');
          console.log('   - NVIDIA 드라이버를 재설치해보세요.');
        } else if (stderr.includes('Unknown encoder')) {
          console.log('   - FFmpeg가 NVENC 지원 없이 컴파일되었습니다.');
          console.log('   - 별도로 NVENC 지원 FFmpeg를 설치해야 합니다.');
        } else if (stderr.includes('InitializeEncoder failed')) {
          console.log('   - NVENC 초기화 실패.');
          console.log('   - GPU가 다른 프로세스에 의해 점유되었을 수 있습니다.');
        }
      }
      
      console.log();
      printConclusion(false);
    }
  });
}

function testCpuEncoding() {
  console.log('   (1초짜리 더미 비디오를 libx264로 인코딩...)');
  
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', 'color=black:s=256x144:d=1',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-b:v', '100k',
    '-f', 'null',
    '-'
  ];
  
  const testProcess = spawn(ffmpegPath, args);
  
  const timeout = setTimeout(() => {
    testProcess.kill();
    console.log('   ❌ 타임아웃');
  }, 5000);
  
  testProcess.on('close', (code) => {
    clearTimeout(timeout);
    
    if (code === 0) {
      console.log('   ✅ CPU 인코딩 성공!\n');
      printConclusion(false);
    } else {
      console.log('   ❌ CPU 인코딩도 실패\n');
      printConclusion(false);
    }
  });
}

function printConclusion(nvencWorks: boolean) {
  console.log('='.repeat(60));
  console.log('📊 결론');
  console.log('='.repeat(60));
  
  if (nvencWorks) {
    console.log('✅ NVENC가 정상 작동합니다!');
    console.log('   VideoForest 스트리밍 서비스에서 GPU 가속이 사용됩니다.');
    console.log('   예상 성능: CPU 대비 3~10배 빠른 트랜스코딩 🚀');
  } else {
    console.log('⚠️  NVENC를 사용할 수 없습니다.');
    console.log('   VideoForest는 CPU (libx264)로 작동합니다.');
    console.log('   성능이 느려질 수 있지만, 정상적으로 작동합니다. 💻');
    
    console.log('\n💡 NVENC를 활성화하려면:');
    console.log('   1. NVENC 지원 FFmpeg 다운로드:');
    console.log('      https://www.gyan.dev/ffmpeg/builds/');
    console.log('      (ffmpeg-release-full.7z 다운로드)');
    console.log('\n   2. 압축 해제 후 ffmpeg.exe 경로를 환경변수 PATH에 추가');
    console.log('      또는 프로젝트에 복사');
    console.log('\n   3. 시스템 FFmpeg가 우선순위가 높으므로 자동 인식됩니다.');
  }
  
  console.log('='.repeat(60));
}

