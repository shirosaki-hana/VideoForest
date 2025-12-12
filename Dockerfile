# =============================================================================
# VideoForest Dockerfile
# Multi-stage build for optimized production image
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Base image with pnpm
# -----------------------------------------------------------------------------
FROM node:24-slim AS base

# pnpm 설치
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2: Dependencies installer
# -----------------------------------------------------------------------------
FROM base AS deps

# 워크스페이스 설정 파일들 복사
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./

# 각 패키지의 package.json 복사
COPY types/package.json ./types/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# 프로덕션 의존성만 설치 (devDependencies 제외하지 않음 - 빌드에 필요)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage 3: Types package build
# -----------------------------------------------------------------------------
FROM deps AS types-builder

COPY types ./types
RUN pnpm --filter types run build

# -----------------------------------------------------------------------------
# Stage 4: Frontend build
# -----------------------------------------------------------------------------
FROM deps AS frontend-builder

# types 빌드 결과물 복사
COPY --from=types-builder /app/types ./types

# 프론트엔드 소스 복사 및 빌드
COPY frontend ./frontend
RUN pnpm --filter frontend run build

# -----------------------------------------------------------------------------
# Stage 5: Backend build
# -----------------------------------------------------------------------------
FROM deps AS backend-builder

# 빌드에 필요한 네이티브 모듈 의존성 (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# types 빌드 결과물 복사
COPY --from=types-builder /app/types ./types

# 백엔드 소스 복사
COPY backend ./backend

# Prisma 클라이언트 생성 및 백엔드 빌드
RUN pnpm --filter backend run build

# -----------------------------------------------------------------------------
# Stage 6: Production runtime
# -----------------------------------------------------------------------------
FROM node:24-slim AS production

# 런타임 의존성 설치 (FFmpeg, FFprobe)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    # Intel QSV 지원을 위한 패키지 (선택적)
    intel-media-va-driver-non-free \
    libmfx1 \
    libva-drm2 \
    libva2 \
    # 기타 유틸리티
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# 보안을 위한 non-root 사용자 생성
RUN groupadd --gid 1000 videoforest \
    && useradd --uid 1000 --gid videoforest --shell /bin/bash --create-home videoforest

WORKDIR /app

# pnpm 설치 (프로덕션 의존성 설치용)
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

# 워크스페이스 설정 복사
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./

# 각 패키지의 package.json 복사
COPY types/package.json ./types/
COPY backend/package.json ./backend/

# 프로덕션 의존성만 설치 (better-sqlite3 네이티브 빌드 필요)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod=false

# 빌드 도구 제거 (이미지 크기 최적화)
RUN apt-get purge -y python3 make g++ && apt-get autoremove -y

# 빌드된 결과물 복사
COPY --from=types-builder /app/types/dist ./types/dist
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/prisma ./backend/prisma
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 데이터 디렉토리 생성 및 권한 설정
RUN mkdir -p /app/backend/temp /app/data /media \
    && chown -R videoforest:videoforest /app /media

# 환경 변수 기본값
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4001
ENV DATABASE_URL_SQLITE=file:/app/data/videoforest.db
ENV HLS_TEMP_DIR=/app/backend/temp

# 포트 노출
EXPOSE 4001

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:4001/api/auth/status').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# non-root 사용자로 전환
USER videoforest

# 서버 시작
CMD ["node", "backend/dist/index.js"]

