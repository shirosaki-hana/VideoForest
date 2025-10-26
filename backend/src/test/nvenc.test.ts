/// <reference types="node" />
/**
 * NVENC Hardware Acceleration Detection Test
 * 
 * This script tests whether NVENC (NVIDIA GPU encoding) is available
 * on the current system using the production FFmpeg detection logic.
 * 
 * FFmpeg Detection Priority:
 *   1. System FFmpeg (if available in PATH)
 *   2. @ffmpeg-installer/ffmpeg (bundled fallback)
 * 
 * Usage:
 *   cd backend
 *   npx tsx src/test/nvenc.test.ts
 * 
 * Exit codes:
 *   0 - NVENC is available and working
 *   1 - NVENC is not available (will fallback to CPU)
 */

import { spawn } from 'child_process';
import { detectFFmpeg } from '../utils/ffmpeg.js';

async function main() {
  console.log('='.repeat(70));
  console.log('NVENC Hardware Acceleration Detection Test');
  console.log('='.repeat(70));
  
  // Use production FFmpeg detection logic
  console.log('Detecting FFmpeg using production logic...');
  const ffmpegInfo = await detectFFmpeg();
  const ffmpegPath = ffmpegInfo.path;
  
  console.log(`FFmpeg Path: ${ffmpegPath}`);
  console.log(`FFmpeg Source: ${ffmpegInfo.source} (${ffmpegInfo.version})\n`);

  // Step 1: Check FFmpeg version
  console.log('[1/3] Checking FFmpeg version...');
  const versionProcess = spawn(ffmpegPath, ['-version']);
  let versionOutput = '';

  versionProcess.stdout.on('data', (data) => {
    versionOutput += data.toString();
  });

  versionProcess.on('close', () => {
    const firstLine = versionOutput.split('\n')[0];
    console.log(`      ${firstLine}\n`);
    
    checkEncoders(ffmpegPath);
  });
}

function checkEncoders(ffmpegPath: string) {
  console.log('[2/3] Checking available H.264 encoders...');
  
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
      console.log('      ERROR: No H.264 encoders found\n');
      process.exit(1);
    }
    
    h264Encoders.forEach(encoder => {
      const hasNvenc = encoder.includes('nvenc');
      const marker = hasNvenc ? '[NVENC]' : '[OTHER]';
      console.log(`      ${marker} ${encoder}`);
    });
    console.log();
    
    const hasNvenc = encodersOutput.includes('nvenc');
    
    if (hasNvenc) {
      console.log('      NVENC encoder detected. Testing actual encoding...\n');
      testNvencEncoding(ffmpegPath);
    } else {
      console.log('      NVENC encoder not found.');
      console.log('      Reason: Bundled FFmpeg may not include NVENC support.\n');
      
      console.log('[3/3] Testing CPU encoder (libx264) as fallback...');
      testCpuEncoding(ffmpegPath);
    }
  });
}

function testNvencEncoding(ffmpegPath: string) {
  console.log('[3/3] Testing NVENC encoding with actual video...');
  console.log('      Encoding 1-second black video with h264_nvenc...');
  
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', 'color=black:s=256x144:d=1',
    '-c:v', 'h264_nvenc',
    '-preset', 'llhp',
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

function testCpuEncoding(ffmpegPath: string) {
  console.log('      Encoding 1-second black video with libx264...');
  
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
    console.log('      ERROR: Timeout\n');
    printResult(false, 'CPU encoding also failed');
  }, 5000);
  
  testProcess.on('close', (code) => {
    clearTimeout(timeout);
    
    if (code === 0) {
      console.log('      SUCCESS (CPU encoding works)\n');
      printResult(false, 'CPU fallback available');
    } else {
      console.log('      FAILED\n');
      printResult(false, 'Both GPU and CPU encoding failed');
    }
  });
}

function printResult(nvencWorks: boolean, errorMessage: string) {
  console.log('='.repeat(70));
  console.log('Test Result');
  console.log('='.repeat(70));
  
  if (nvencWorks) {
    console.log('Status: NVENC AVAILABLE');
    console.log('');
    console.log('NVENC hardware acceleration is working correctly.');
    console.log('VideoForest will use GPU acceleration for transcoding.');
    console.log('Expected performance: 3-10x faster than CPU encoding.');
    console.log('');
    console.log('Your system configuration:');
    console.log('  - FFmpeg: Includes NVENC support');
    console.log('  - GPU: NVIDIA GPU detected and functional');
    console.log('  - Driver: NVIDIA driver is properly installed');
  } else {
    console.log('Status: NVENC NOT AVAILABLE');
    console.log('');
    console.log('NVENC hardware acceleration is not available.');
    console.log('VideoForest will use CPU (libx264) for transcoding.');
    console.log('Performance will be slower but functionality is not affected.');
    
    if (errorMessage) {
      console.log('');
      console.log('Error details:');
      
      if (errorMessage.includes('No NVENC capable devices found') || errorMessage.includes('unsupported device')) {
        console.log('  - GPU detected but does not support NVENC hardware encoding');
        console.log('  - Check: nvidia-smi to verify GPU model');
        console.log('  - Note: Some mobile/entry-level GPUs lack NVENC support');
        console.log('    (e.g. some GeForce MX series, GT 1030, etc.)');
      } else if (errorMessage.includes('Cannot load')) {
        console.log('  - NVENC library cannot be loaded');
        console.log('  - Try: Reinstall NVIDIA driver');
      } else if (errorMessage.includes('Unknown encoder')) {
        console.log('  - FFmpeg was compiled without NVENC support');
        console.log('  - Solution: Install FFmpeg with NVENC support');
        console.log('  - Download: https://www.gyan.dev/ffmpeg/builds/');
      } else if (errorMessage.includes('InitializeEncoder failed')) {
        console.log('  - NVENC encoder initialization failed');
        console.log('  - GPU may be busy or driver issue');
      } else if (errorMessage.includes('CPU fallback available')) {
        console.log('  - NVENC not detected, but CPU encoding works');
        console.log('  - System will function normally with CPU encoding');
      } else {
        console.log(`  - ${errorMessage}`);
      }
    }
    
    console.log('');
    console.log('To enable NVENC:');
    console.log('  1. Ensure NVIDIA GPU is installed and detected');
    console.log('  2. Update NVIDIA driver to latest version');
    console.log('  3. Install FFmpeg with NVENC support (if using bundled version)');
  }
  
  console.log('='.repeat(70));
  
  process.exit(nvencWorks ? 0 : 1);
}

// Run the test
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
