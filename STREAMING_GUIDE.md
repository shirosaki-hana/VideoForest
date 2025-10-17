# HLS 스트리밍 기능 구현 가이드

## 구현된 기능

VideoForest 프로젝트에 FFmpeg 기반 실시간 HLS 트랜스코딩 및 스트리밍 기능이 구현되었습니다.

### 백엔드 (Backend)

#### 1. HLS 스트리밍 서비스 (`backend/src/services/streaming.ts`)

**주요 기능:**
- FFmpeg를 이용한 실시간 HLS 트랜스코딩
- 세션 기반 스트리밍 관리
- 자동 세션 정리 (30분 타임아웃)
- H.264 비디오 코덱, AAC 오디오 코덱 사용
- 6초 세그먼트로 분할

**주요 함수:**
- `startStreaming(mediaId: string)`: 스트리밍 시작
- `stopStreaming(mediaId: string)`: 스트리밍 중지
- `getPlaylistPath(mediaId: string)`: 플레이리스트 경로 조회
- `getSegmentPath(mediaId: string, segmentName: string)`: 세그먼트 경로 조회
- `stopAllStreaming()`: 모든 세션 종료

**트랜스코딩 설정:**

GPU 가속을 지원하며, 환경변수 `TRANSCODE_METHOD`로 제어 가능합니다:

1. **CPU (libx264)** - 기본값
   ```bash
   -c:v libx264           # H.264 비디오 코덱
   -preset veryfast       # 빠른 인코딩
   -crf 23                # 품질 설정 (0-51, 낮을수록 고품질)
   ```
   - 장점: 품질 우수, 호환성 좋음
   - 단점: 느림, CPU 사용량 높음

2. **NVENC (h264_nvenc)** - NVIDIA GPU 가속
   ```bash
   -c:v h264_nvenc        # NVIDIA 하드웨어 인코더
   -preset hq             # NVENC 프리셋 (slow/medium/fast/hp/hq/bd/ll/llhq/llhp)
   -rc vbr                # 가변 비트레이트
   -cq 23                 # 품질 설정
   ```
   - 장점: 매우 빠름, CPU 부담 적음
   - 단점: NVIDIA GPU 필요, CPU 대비 품질 약간 낮을 수 있음
   - 요구사항: NVIDIA GPU (GTX 600 시리즈 이상, Pascal 이상 권장)

3. **QSV (h264_qsv)** - Intel Quick Sync Video
   ```bash
   -c:v h264_qsv          # Intel 하드웨어 인코더
   -preset medium         # QSV 프리셋
   -global_quality 23     # 품질 설정
   ```
   - 장점: 빠름, CPU 부담 적음, Intel 내장 GPU 사용
   - 단점: Intel GPU 필요, CPU 대비 품질 약간 낮을 수 있음
   - 요구사항: Intel CPU (2세대 Core 프로세서 이상)

**공통 설정:**
```bash
-c:a aac              # AAC 오디오 코덱
-hls_time 4           # 4초 세그먼트
-hls_list_size 0      # 모든 세그먼트 유지
```

**GPU 가속 폴백:**
GPU 인코더 초기화 실패 시 자동으로 CPU 인코딩으로 폴백됩니다.

#### 2. 스트리밍 라우트 (`backend/src/api/streaming.routes.ts`)

**엔드포인트:**

- `GET /api/stream/hls/:mediaId/playlist.m3u8`
  - HLS 마스터 플레이리스트 제공
  - Content-Type: `application/vnd.apple.mpegurl`

- `GET /api/stream/hls/:mediaId/:segmentName`
  - HLS 세그먼트 파일 제공 (segment_XXX.ts)
  - Content-Type: `video/mp2t`
  - 보안: 세그먼트 파일명 검증 (`/^segment_\d{3}\.ts$/`)

- `GET /api/stream/media/:mediaId`
  - 미디어 정보 조회 (재생용 메타데이터)

#### 3. 서버 종료 시 자동 정리

`backend/src/index.ts`에서 서버 종료 시 모든 스트리밍 세션을 자동으로 종료하도록 구현되었습니다.

### 타입 정의 (Types)

#### `types/src/media.ts`에 추가된 타입:

```typescript
export const MediaInfoResponseSchema = z.object({
  success: z.literal(true),
  media: z.object({
    id: z.string(),
    name: z.string(),
    duration: z.number().nullable(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    codec: z.string().nullable(),
    bitrate: z.number().int().nullable(),
    fps: z.number().nullable(),
    audioCodec: z.string().nullable(),
    fileSize: z.number().int().nullable(),
  }),
});
```

### 프론트엔드 (Frontend)

#### 1. 스트리밍 API 클라이언트 (`frontend/src/api/streaming.ts`)

**주요 함수:**
- `getMediaInfo(mediaId: string)`: 미디어 정보 조회
- `getHLSPlaylistUrl(mediaId: string)`: HLS 플레이리스트 URL 생성

#### 2. Video.js 플레이어 컴포넌트 (`frontend/src/components/VideoPlayer.tsx`)

**기능:**
- Video.js 기반 HLS 플레이어
- 반응형 디자인 (fluid, responsive)
- 재생 완료, 에러 이벤트 핸들링
- 자동 정리 (컴포넌트 언마운트 시)

**Props:**
```typescript
interface VideoPlayerProps {
  src: string;              // HLS 플레이리스트 URL
  onReady?: (player: Player) => void;
  onEnded?: () => void;
  onError?: (error: any) => void;
}
```

#### 3. 미디어 재생 페이지 (`frontend/src/pages/PlayerPage.tsx`)

**기능:**
- 미디어 정보 표시
- Video.js 플레이어 통합
- 로딩 및 에러 상태 처리
- 미디어 메타데이터 표시 (해상도, 코덱, 비트레이트 등)
- 뒤로가기 버튼

#### 4. 미디어 파일 클릭 핸들러

`frontend/src/components/media/MediaFileItem.tsx`에 클릭 이벤트가 추가되어 미디어 파일 클릭 시 재생 페이지로 이동합니다.

#### 5. 라우팅 설정

`frontend/src/App.tsx`에 `/player/:mediaId` 라우트가 추가되었습니다.

## 사용 방법

### 1. 환경 설정

서버 시작 전에 환경변수를 설정합니다:

```bash
# .env 파일 또는 시스템 환경변수
TRANSCODE_METHOD=cpu    # cpu, nvenc, qsv 중 선택
```

**트랜스코딩 방식 선택 가이드:**

- **CPU (libx264)**: 기본값, 모든 시스템에서 작동
- **NVENC (h264_nvenc)**: NVIDIA GPU가 있고 빠른 인코딩이 필요한 경우
- **QSV (h264_qsv)**: Intel CPU의 내장 GPU를 활용하고 싶은 경우

💡 **팁:** GPU 인코더가 실패하면 자동으로 CPU로 폴백되므로, GPU를 사용할 수 있는 환경이라면 `nvenc` 또는 `qsv`로 설정해보세요!

### 2. 미디어 스캔

1. 미디어 목록 페이지에서 "Scan Media" 버튼 클릭
2. 미디어 파일이 자동으로 스캔되어 데이터베이스에 저장됨

### 3. 미디어 재생

1. 미디어 목록에서 재생하고 싶은 파일 클릭
2. 자동으로 재생 페이지로 이동
3. 백엔드가 자동으로 FFmpeg를 통해 HLS 트랜스코딩 시작
4. 플레이리스트가 생성되면 Video.js가 자동으로 재생

### 4. 세션 관리

- 스트리밍 세션은 자동으로 관리됨
- 5분 동안 접근이 없으면 자동으로 세션 종료 (영상 시청 중에는 자동 갱신)
- 페이지 이탈 시 자동으로 세션 종료 (리소스 절약)
- 서버 종료 시 모든 세션이 안전하게 정리됨

## 보안 고려사항

1. **인증**: 모든 스트리밍 엔드포인트는 `requireAuth` 미들웨어로 보호됨
2. **파일명 검증**: 세그먼트 파일명은 정규식으로 검증 (`/^segment_\d{3}\.ts$/`)
3. **경로 탐색 방지**: 미디어 ID를 통한 간접 참조로 파일 시스템 보호

## 성능 최적화

1. **세션 재사용**: 동일한 미디어에 대한 중복 트랜스코딩 방지
2. **GPU 가속**: NVIDIA NVENC 또는 Intel QSV를 통한 하드웨어 가속 인코딩
3. **빠른 인코딩**: CPU 모드에서도 `veryfast` 프리셋 사용
4. **캐싱**: 세그먼트 파일은 1년간 캐싱 (`max-age=31536000`)
5. **자동 정리**: 사용하지 않는 세션의 자동 종료로 리소스 절약
6. **스마트 폴백**: GPU 가속 실패 시 자동으로 CPU로 전환

### GPU 가속 성능 비교

**1080p 비디오 기준 (대략적인 수치):**
- CPU (libx264): ~0.5-1x 실시간 속도
- NVENC (h264_nvenc): ~5-10x 실시간 속도
- QSV (h264_qsv): ~3-5x 실시간 속도

💡 **참고:** GPU 가속은 CPU 사용률을 크게 낮추면서도 더 빠른 인코딩이 가능합니다!

## 트러블슈팅

### 재생이 시작되지 않는 경우

1. FFmpeg가 제대로 설치되었는지 확인
2. 백엔드 로그 확인 (`logger.error` 메시지)
3. 미디어 파일이 존재하는지 확인
4. 브라우저 콘솔에서 네트워크 에러 확인

### GPU 인코더를 사용하고 싶은데 작동하지 않는 경우

1. **NVENC (NVIDIA)**
   - NVIDIA GPU 드라이버가 최신 버전인지 확인
   - FFmpeg가 NVENC를 지원하도록 빌드되었는지 확인
   - 명령어: `ffmpeg -encoders | grep nvenc`
   - GPU가 NVENC를 지원하는지 확인 (GTX 600 시리즈 이상)

2. **QSV (Intel)**
   - Intel GPU 드라이버가 설치되어 있는지 확인
   - FFmpeg가 QSV를 지원하도록 빌드되었는지 확인
   - 명령어: `ffmpeg -encoders | grep qsv`
   - CPU가 Quick Sync Video를 지원하는지 확인 (2세대 Core i 이상)

3. **일반적인 해결책**
   - 로그에서 "Falling back to CPU encoding" 메시지 확인
   - GPU 가속 실패 시 자동으로 CPU로 폴백되므로, 재생 자체는 가능합니다
   - `TRANSCODE_METHOD=cpu`로 설정하여 명시적으로 CPU 사용 가능

### 세그먼트 파일을 찾을 수 없는 경우

1. 스트리밍 세션이 타임아웃되었을 수 있음
2. 페이지를 새로고침하여 세션 재시작

### 메모리 누수 의심

1. `temp/hls/` 디렉터리 확인
2. 필요시 수동으로 정리 가능
3. 서버 재시작으로 모든 세션 정리

## 구현된 개선 사항 ✅

1. ✅ **하드웨어 가속**: GPU를 이용한 트랜스코딩 가속 (NVENC, QSV)
2. ✅ **스마트 세션 관리**: 페이지 이탈 시 자동 종료, 리소스 절약

## 향후 개선 사항

1. **Adaptive Bitrate Streaming**: 여러 해상도/비트레이트 제공
2. **트랜스코딩 큐**: 동시 트랜스코딩 제한 및 큐 관리
3. **프리트랜스코딩**: 자주 재생되는 파일을 미리 트랜스코딩
4. **자막 지원**: 외부 자막 파일 지원
5. **재생 진행 상태 저장**: 중단된 위치부터 이어보기
6. **AMD GPU 지원**: AMF (Advanced Media Framework) 인코더 지원

## 의존성

### 백엔드
- `@ffmpeg-installer/ffmpeg`: FFmpeg 실행 파일
- `@ffprobe-installer/ffprobe`: FFprobe 실행 파일 (이미 있음)

### 프론트엔드
- `video.js`: HTML5 비디오 플레이어
- `@types/video.js`: Video.js TypeScript 타입 정의

## 디렉터리 구조

```
backend/
├── src/
│   ├── services/
│   │   └── streaming.ts        # HLS 스트리밍 서비스
│   └── api/
│       └── streaming.routes.ts # 스트리밍 엔드포인트
├── temp/
│   └── hls/                    # HLS 임시 파일 (자동 생성/정리)
│       └── {mediaId}/
│           ├── playlist.m3u8
│           └── segment_*.ts

frontend/
├── src/
│   ├── api/
│   │   └── streaming.ts        # 스트리밍 API 클라이언트
│   ├── components/
│   │   └── VideoPlayer.tsx     # Video.js 플레이어
│   ├── pages/
│   │   └── PlayerPage.tsx      # 재생 페이지
│   └── types/
│       └── video.js.d.ts       # Video.js 타입 정의

types/
└── src/
    └── media.ts                # 스트리밍 타입 정의
```

## 라이선스

MIT

