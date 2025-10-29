/// <reference types="node" />
/**
 * Intel Quick Sync Video (QSV) Detection Test
 * 
 * This script tests whether Intel QSV hardware acceleration is available.
 * QSV is available on Intel CPUs with integrated graphics (iGPU).
 * 
 * Usage:
 *   cd backend
 *   npx tsx src/test/qsv.test.ts
 * 
 * Exit codes:
 *   0 - QSV is available and working
 *   1 - QSV is not available (will fallback to CPU)
 */

import { spawn } from 'child_process';
import { detectFFmpeg } from '../utils/ffmpeg.js';

async function main() {
  console.log('='.repeat(70));
  console.log('Intel Quick Sync Video (QSV) Detection Test');
  console.log('='.repeat(70));
  
  const ffmpegInfo = await detectFFmpeg();
  const ffmpegPath = ffmpegInfo.path;
  
  console.log(`FFmpeg Path: ${ffmpegPath}`);
  console.log(`FFmpeg Source: ${ffmpegInfo.source} (${ffmpegInfo.version})\n`);

  console.log('[1/2] Checking available H.264 encoders...');
  
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
    
    h264Encoders.forEach(encoder => {
      const hasQsv = encoder.includes('qsv');
      const marker = hasQsv ? '[QSV]' : '[OTHER]';
      console.log(`      ${marker} ${encoder}`);
    });
    console.log();
    
    const hasQsv = encodersOutput.includes('h264_qsv');
    
    if (hasQsv) {
      console.log('      QSV encoder detected. Testing actual encoding...\n');
      testQsvEncoding(ffmpegPath);
    } else {
      console.log('      QSV encoder not found.');
      console.log('      FFmpeg may not be compiled with QSV support.\n');
      printResult(false, 'QSV encoder not available in FFmpeg');
    }
  });
}

function testQsvEncoding(ffmpegPath: string) {
  console.log('[2/2] Testing QSV encoding with actual video...');
  console.log('      Encoding 1-second black video with h264_qsv...');
  
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-init_hw_device', 'qsv=hw',
    '-filter_hw_device', 'hw',
    '-f', 'lavfi',
    '-i', 'color=black:s=256x144:d=1',
    '-c:v', 'h264_qsv',
    '-preset', 'veryfast',
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
    console.log('      ERROR: Timeout (5 seconds)\n');
    printResult(false, stderr);
  }, 5000);
  
  testProcess.on('close', (code) => {
    clearTimeout(timeout);
    
    if (code === 0) {
      console.log('      SUCCESS\n');
      printResult(true, '');
    } else {
      console.log(`      FAILED (exit code: ${code})\n`);
      printResult(false, stderr);
    }
  });
}

function printResult(qsvWorks: boolean, errorMessage: string) {
  console.log('='.repeat(70));
  console.log('Test Result');
  console.log('='.repeat(70));
  
  if (qsvWorks) {
    console.log('Status: QSV AVAILABLE');
    console.log('');
    console.log('Intel Quick Sync Video is working correctly.');
    console.log('VideoForest can use Intel GPU acceleration for transcoding.');
    console.log('Expected performance: 2-5x faster than CPU encoding.');
    console.log('');
    console.log('Your system configuration:');
    console.log('  - FFmpeg: Includes QSV support');
    console.log('  - CPU: Intel CPU with integrated graphics');
    console.log('  - Driver: Intel graphics driver is properly installed');
  } else {
    console.log('Status: QSV NOT AVAILABLE');
    console.log('');
    console.log('Intel Quick Sync Video is not available.');
    console.log('VideoForest will use CPU (libx264) for transcoding.');
    
    if (errorMessage) {
      console.log('');
      console.log('Possible reasons:');
      
      if (errorMessage.includes('Cannot load')) {
        console.log('  - Intel graphics driver not installed');
        console.log('  - Try: Install i965-va-driver or intel-media-driver');
      } else if (errorMessage.includes('No such device')) {
        console.log('  - No Intel integrated GPU found');
        console.log('  - QSV requires Intel CPU with iGPU (HD Graphics, Iris, etc.)');
      } else if (errorMessage.includes('not available in FFmpeg')) {
        console.log('  - FFmpeg was compiled without QSV support');
        console.log('  - Try: Install FFmpeg with --enable-libmfx');
      } else if (errorMessage.includes('Device creation failed')) {
        console.log('  - Intel GPU detected but cannot initialize');
        console.log('  - Check: /dev/dri permissions');
        console.log('  - Try: sudo usermod -a -G video $USER');
      } else {
        console.log(`  - ${errorMessage.split('\n')[0]}`);
      }
    }
    
    console.log('');
    console.log('To enable QSV:');
    console.log('  1. Ensure Intel CPU with integrated graphics');
    console.log('  2. Install Intel graphics driver (i965-va-driver or intel-media-driver)');
    console.log('  3. Install FFmpeg with QSV support');
    console.log('  4. Ensure user has permission to /dev/dri');
  }
  
  console.log('='.repeat(70));
  
  process.exit(qsvWorks ? 0 : 1);
}

// Run the test
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
