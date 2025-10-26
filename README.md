# VideoForest

A self-hosted video streaming server with just-in-time (JIT) transcoding for resource-constrained home servers. Delivers HLS streams with automatic quality adaptation without pre-processing entire video libraries.

## Overview

VideoForest is designed to run on personal NAS or home servers with limited resources. Instead of pre-transcoding all media files, it employs sophisticated JIT transcoding that generates HLS segments on-demand only when requested. Transcoded segments are permanently cached for reuse.

### Key Features

- **JIT Transcoding**: Segments are transcoded only when requested, minimizing upfront storage and processing requirements
- **Persistent Caching**: Once transcoded, segments are stored permanently and reused across sessions
- **Hardware Acceleration**: Automatic detection and use of NVIDIA NVENC with CPU fallback
- **Multiple Quality Profiles**: Adaptive bitrate streaming with automatic profile selection based on source media
- **Efficient Seeking**: Back-seeking and quality switching work seamlessly without re-transcoding
- **Modern Web Interface**: React-based frontend with Material UI and Video.js player
- **Authentication**: Built-in password protection with session management
- **Folder Structure**: Hierarchical media organization with folder scanning

## Architecture

### Backend Stack

- **Fastify**: High-performance web server
- **Prisma + SQLite**: Type-safe database ORM with embedded database
- **FFmpeg**: Video transcoding engine with hardware acceleration support
- **TypeScript**: Full type safety across the codebase

### Frontend Stack

- **React 19**: Modern UI framework
- **Material UI (MUI)**: Component library
- **Video.js**: HTML5 video player with HLS support
- **Zustand**: State management
- **i18next**: Internationalization

### Transcoding Strategy

1. Media duration is analyzed on first access
2. HLS playlist is generated based on total duration
3. Segments are transcoded on-demand when requested by the player
4. Hardware acceleration (NVENC) is automatically detected and used when available
5. Transcoded segments are permanently cached on disk
6. Subsequent requests serve cached segments directly

## Requirements

- Node.js 18 or later
- pnpm 9 or later
- FFmpeg with libx264 support (automatically installed via npm packages)
- (Optional) NVIDIA GPU with NVENC support for hardware acceleration

## Installation

Clone the repository:

```bash
git clone https://github.com/shirosaki-hana/VideoForest.git
cd VideoForest
```

Install dependencies:

```bash
pnpm install
```

## Configuration

Create a `.env` file in the project root (or set environment variables):

```env
# Server Configuration
HOST=127.0.0.1
PORT=4001
NODE_ENV=development

# Frontend URL (for CORS)
FRONTEND_URL=http://127.0.0.1:4001

# Database
DATABASE_URL_SQLITE=file:./prisma/videoforest.db

# Session
SESSION_COOKIE=session
SESSION_TTL=24h

# Rate Limiting
RATELIMIT_MAX=10
RATELIMIT_WINDOWMS=10s

# Media Paths (comma-separated for multiple paths)
MEDIA_PATHS=./backend/media

# Speed Mode (use faster encoding presets, lower quality)
VIDEOFOREST_SPEED_MODE=0
```

### Environment Variables

- `HOST`: Server bind address (default: `127.0.0.1`)
- `PORT`: Server port (default: `4001`)
- `NODE_ENV`: Environment mode (`development` or `production`)
- `FRONTEND_URL`: Frontend URL for CORS configuration
- `DATABASE_URL_SQLITE`: SQLite database file path
- `SESSION_COOKIE`: Cookie name for session management
- `SESSION_TTL`: Session lifetime (e.g., `24h`, `7d`)
- `RATELIMIT_MAX`: Maximum requests per time window
- `RATELIMIT_WINDOWMS`: Rate limit time window (e.g., `10s`)
- `MEDIA_PATHS`: Comma-separated list of media directories to scan
- `VIDEOFOREST_SPEED_MODE`: Enable faster encoding presets (`0` or `1`)

## Running the Application

### Development Mode

Run both backend and frontend in development mode with hot reloading:

```bash
pnpm dev
```

Or run them separately:

```bash
# Backend only
pnpm dev:backend

# Frontend only
pnpm dev:frontend
```

### Production Build

Build the entire application:

```bash
pnpm db:deploy
pnpm build
```

Run the production server:

```bash
pnpm start
```

The server will serve both API and frontend from a single port. Access the application at `http://127.0.0.1:4001` (or your configured `HOST:PORT`).

## Database Management

Initialize or update the database:

```bash
# Apply migrations in development
pnpm db:dev

# Apply migrations in production
pnpm db:deploy

# View database in Prisma Studio
pnpm db:studio

# Check migration status
pnpm db:status

# Reset database (development only)
pnpm db:reset
```

## Usage

### First-Time Setup

1. Start the application
2. Navigate to `http://127.0.0.1:4001`
3. Set up an admin password on the initial setup page
4. Log in with your password

### Media Management

1. Place video files in the configured `MEDIA_PATHS` directories
2. The server will automatically scan and index media files on startup
3. Browse and play videos through the web interface

### Cache Management

Transcoded segments are stored in `backend/temp/hls/`. To clear the cache:

```bash
pnpm clean:cache
```

## License

MIT License. See [LICENSE](LICENSE) for details.

