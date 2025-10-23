# VideoForest

A lightweight, resource-efficient media streaming server designed for NAS environments. VideoForest provides on-demand video transcoding with adaptive bitrate streaming, optimized for systems with limited computational resources.

## Project Status

**This is a prototype.** The project is in active development and not yet production-ready. Features and APIs may change without notice.

## Overview

VideoForest is a self-hosted media server that streams video content from your NAS to web browsers. Unlike traditional media servers that pre-transcode all content or require powerful hardware, VideoForest uses Just-In-Time (JIT) transcoding and Lazy Adaptive Bitrate (ABR) strategies to minimize resource usage while maintaining a smooth viewing experience.

## Key Features

### Just-In-Time Transcoding
- Videos are transcoded on-demand only when requested
- No storage wasted on pre-encoded files
- Transcoding starts immediately when playback begins
- Sessions are automatically cleaned up after inactivity

### Lazy Adaptive Bitrate (ABR)
- Initial quality variant is transcoded based on source resolution
- Additional quality variants are generated only when the player requests them
- Reduces CPU and disk I/O by avoiding unnecessary transcoding
- Supports multiple quality levels: 1080p, 720p, 480p, 360p

### Resource-Efficient Design
- Optimized for low-power NAS hardware
- CPU-based H.264 encoding with configurable profiles
- Automatic session cleanup and garbage collection
- Temporary files stored in dedicated HLS cache directory
- Individual quality variants can be cleaned up while maintaining the session

### HLS Streaming
- Industry-standard HLS (HTTP Live Streaming) protocol
- 6-second segments for balance between latency and buffering
- Automatic fallback quality selection
- Compatible with modern browsers and video players

### Media Management
- Automatic media library scanning
- Hierarchical folder structure preservation
- Metadata extraction using FFprobe
- Support for multiple video formats (MP4, MKV, AVI, MOV, WebM, and more)

### User Interface
- Modern React-based web interface
- Dark/light theme support
- Internationalization (English/Korean)
- Video player with quality selection
- Media library browser with folder navigation
- Auto-play next feature for continuous viewing

## Technical Stack

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Fastify (high-performance web server)
- **Database**: SQLite with Prisma ORM
- **Video Processing**: FFmpeg for transcoding and FFprobe for metadata extraction
- **Authentication**: Argon2 password hashing with session-based auth

### Frontend
- **Framework**: React 19 with TypeScript
- **UI Library**: Material-UI (MUI)
- **State Management**: Zustand
- **Video Player**: Video.js with HLS support
- **Routing**: React Router v7
- **Build Tool**: Vite

### Shared
- **Package Manager**: pnpm with workspace support
- **Type Safety**: Shared TypeScript types across frontend/backend
- **Code Quality**: ESLint, Prettier

## Architecture

### Streaming Architecture

```
Client Request
    ↓
Master Playlist (lists all quality variants)
    ↓
Initial Quality Variant (e.g., 720p)
    → FFmpeg Process Started
    → HLS Segments Generated
    ↓
Player Requests Different Quality (e.g., 1080p)
    → New FFmpeg Process Started (Lazy ABR)
    → New Quality Variant Segments Generated
    ↓
Seamless Quality Switching
```

### Session Management

```
Session Manager
    ├─ Active Sessions (Map<mediaId, HLSSession>)
    │   └─ Variants (Map<quality, VariantSession>)
    │       ├─ FFmpeg Process
    │       ├─ Output Directory
    │       └─ Segment Count & Timestamps
    ├─ Cleanup Tasks
    │   ├─ Variant Timeout (10 minutes)
    │   └─ Session Timeout (30 minutes)
    └─ Failure Tracking (prevents infinite retry loops)
```

### Directory Structure

```
VideoForest/
├── backend/              # Node.js backend server
│   ├── src/
│   │   ├── api/         # REST API routes
│   │   ├── services/    # Business logic
│   │   │   └── streaming/
│   │   │       ├── transcoder/       # FFmpeg integration
│   │   │       ├── session.manager.ts # Session lifecycle
│   │   │       └── media.analyzer.ts  # Codec compatibility checks
│   │   ├── middleware/  # Auth middleware
│   │   ├── database/    # Prisma client
│   │   ├── utils/       # FFmpeg/FFprobe utilities
│   │   └── config/      # Environment configuration
│   ├── prisma/          # Database schema and migrations
│   └── temp/hls/        # Temporary HLS output cache
├── frontend/            # React web interface
│   └── src/
│       ├── pages/       # Route pages
│       ├── components/  # Reusable UI components
│       ├── stores/      # Zustand state stores
│       └── api/         # API client
└── types/               # Shared TypeScript types
```

## Installation

### Prerequisites

- **Node.js**: v20 or higher
- **pnpm**: v8 or higher
- **FFmpeg**: v4.4 or higher (automatically installed via npm package, or use system FFmpeg)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/VideoForest.git
cd VideoForest
```

2. Install dependencies:
```bash
pnpm install
```

3. Configure environment variables:

Create a `.env` file in the `backend/` directory:

```env
# Server Configuration
HOST=127.0.0.1
PORT=4001
NODE_ENV=development

# Frontend URL (for CORS)
FRONTEND_URL=http://127.0.0.1:4001

# Database
DATABASE_URL_SQLITE=file:./prisma/videoforest.db

# Session Configuration
SESSION_COOKIE=session
SESSION_TTL=24h

# Rate Limiting
RATELIMIT_MAX=100
RATELIMIT_WINDOWMS=10s

# Request Body Limit
REQUEST_BODY_LIMIT=3mb

# Media Paths (comma-separated for multiple directories)
# Relative paths are resolved from backend directory
# Absolute paths are used as-is
MEDIA_PATHS=./media,/mnt/nas/videos
```

4. Initialize the database:
```bash
pnpm db:deploy
```

5. Build the project:
```bash
pnpm build
```

## Running the Server

### Development Mode

Run both frontend and backend in development mode with hot-reload:

```bash
pnpm dev
```

This will start:
- Backend API server at `http://127.0.0.1:4001`
- Frontend development server at `http://127.0.0.1:5173`

### Production Mode

1. Build all packages:
```bash
pnpm build
```

2. Start the production server:
```bash
pnpm start
```

The server will serve both API and static frontend files at `http://127.0.0.1:4001`.

### First-Time Setup

1. Navigate to `http://127.0.0.1:4001` (or your configured host/port)
2. Set an initial password on the setup page
3. Log in with your password
4. Click "Scan Media Library" to index your media files
5. Browse and play your videos

## API Endpoints

### Authentication
- `POST /api/auth/setup` - Initial password setup
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/status` - Check authentication status

### Media Library
- `GET /api/v1/media` - Get all media files
- `GET /api/v1/folders` - Get folder structure
- `POST /api/v1/media/scan` - Trigger library scan
- `GET /api/v1/media/scan/status` - Get scan progress

### Streaming
- `GET /api/streaming/hls/:mediaId/master.m3u8` - Master playlist (ABR)
- `GET /api/streaming/hls/:mediaId/:quality/playlist.m3u8` - Quality variant playlist
- `GET /api/streaming/hls/:mediaId/:quality/segment_XXX.ts` - HLS segment
- `GET /api/streaming/media/:mediaId` - Media metadata
- `GET /api/streaming/hls/:mediaId/session` - Session info (debugging)
- `DELETE /api/streaming/hls/:mediaId` - Stop streaming session

## Configuration

### Supported Video Formats

VideoForest supports a wide range of video formats:
- Container: MP4, MKV, AVI, MOV, WMV, FLV, WebM, M4V, MPG, MPEG, 3GP, OGV, TS, M2TS
- Video Codecs: H.264 (native), HEVC/H.265 (transcoded), VP8/VP9 (transcoded), and others
- Audio Codecs: AAC (native), MP3 (native), FLAC (transcoded), Opus (transcoded), and others

### Quality Profiles

Default quality profiles for ABR:

| Profile | Resolution | Video Bitrate | Audio Bitrate |
|---------|------------|---------------|---------------|
| 1080p   | 1920x1080  | 5 Mbps        | 128 kbps      |
| 720p    | 1280x720   | 3 Mbps        | 128 kbps      |
| 480p    | 854x480    | 1.5 Mbps      | 128 kbps      |
| 360p    | 640x360    | 800 kbps      | 96 kbps       |

Quality selection logic:
- Original resolution is analyzed via FFprobe
- Only qualities at or below source resolution are offered (no upscaling)
- Initial transcoding starts with a middle-tier quality
- Additional qualities are generated lazily when requested by the player

### Session Timeouts

- **Variant Timeout**: 10 minutes (individual quality variants are cleaned up after inactivity)
- **Session Timeout**: 30 minutes (entire session is removed)
- **Failure Timeout**: 10 minutes (failed transcoding attempts are retried after this period)

### FFmpeg Configuration

VideoForest uses optimized FFmpeg settings:
- **Codec**: libx264 (software encoding for maximum compatibility)
- **Preset**: medium (balance between speed and quality)
- **CRF**: Variable based on profile bitrate
- **GOP Size**: Aligned with segment duration (6 seconds)
- **Keyframe Interval**: Forced at segment boundaries for accurate seeking
- **Audio**: AAC codec, 48kHz sample rate, stereo

## Database Management

Prisma commands are available through pnpm scripts:

```bash
# View migration status
pnpm db:status

# Apply migrations in development
pnpm db:dev

# Apply migrations in production
pnpm db:deploy

# Generate Prisma Client
pnpm db:generate

# Open Prisma Studio (database GUI)
pnpm db:studio

# Reset database (WARNING: deletes all data)
pnpm db:reset
```

## Performance Considerations

### Resource Usage

On a typical NAS with modest CPU (e.g., Intel Celeron J4125):
- **Initial Startup**: 1-3 seconds to analyze media and start transcoding
- **CPU Usage**: 60-100% of one core per active transcoding session
- **Memory**: ~200-300 MB per transcoding session
- **Disk I/O**: Segments written to temporary directory, auto-cleaned after timeout

### Optimization Tips

1. **Use H.264 source files** when possible to avoid transcoding
2. **Limit concurrent streams** based on your CPU capabilities
3. **Configure MEDIA_PATHS** to scan only necessary directories
4. **Adjust session timeouts** if you have limited disk space
5. **Consider SSD for HLS cache** (backend/temp/hls/) for better I/O performance

## Development

### Project Scripts

```bash
# Install dependencies
pnpm install

# Development mode (hot-reload)
pnpm dev
pnpm dev:backend     # Backend only
pnpm dev:frontend    # Frontend only

# Build for production
pnpm build
pnpm build:backend   # Backend only
pnpm build:frontend  # Frontend only
pnpm build:types     # Shared types only

# Start production server
pnpm start

# Linting and formatting
pnpm lint            # Check all packages
pnpm lint:fix        # Fix all packages
pnpm format          # Format all packages
pnpm format:check    # Check formatting

# Clean build artifacts
pnpm clean
```

### Adding New Features

The codebase is structured as a pnpm workspace with three main packages:

1. **types**: Shared TypeScript types (modify `types/src/`)
2. **backend**: Server-side logic (modify `backend/src/`)
3. **frontend**: Client-side UI (modify `frontend/src/`)

All packages must be built in order: `types` → `backend` → `frontend`

## Known Limitations

- **CPU Encoding Only**: GPU-accelerated encoding (NVENC, QSV, VideoToolbox) is not yet supported
- **Single User**: Only one user account is supported (password-based)
- **No User Permissions**: All authenticated users have full access
- **Limited Subtitle Support**: Subtitles are not yet rendered or embedded in HLS
- **No Resume Functionality**: Playback position is not saved across sessions
- **No Thumbnail Generation**: Video thumbnails are not generated during scanning
- **Prototype Stage**: Not recommended for production use without thorough testing

## Future Roadmap

- Hardware-accelerated transcoding (NVENC, QSV, VAAPI)
- Multi-user support with permissions
- Subtitle support (burn-in or WebVTT)
- Playback history and resume functionality
- Thumbnail generation and preview scrubbing
- Direct play for compatible files (no transcoding)
- Mobile app (React Native or PWA)
- Docker deployment support
- Configurable transcoding profiles

## Troubleshooting

### FFmpeg Not Found

If FFmpeg is not detected:
1. Install FFmpeg on your system: `sudo apt install ffmpeg` (Linux) or download from [ffmpeg.org](https://ffmpeg.org)
2. Ensure FFmpeg is in your system PATH
3. Restart the backend server

### Transcoding Fails

Check the backend logs for FFmpeg errors:
- Codec incompatibility (very old or exotic formats)
- Corrupted video files
- Insufficient disk space for HLS segments

Use the `/api/streaming/hls/:mediaId/session` endpoint to inspect active sessions and failures.

### Playback Stuttering

Possible causes:
- NAS CPU is overloaded (reduce concurrent streams)
- Network bandwidth is insufficient
- Player is requesting a quality higher than transcoding speed
- Disk I/O bottleneck (consider SSD for HLS cache)

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

## Acknowledgments

- **FFmpeg**: The backbone of all media processing
- **Video.js**: Excellent HLS player with ABR support
- **Fastify**: High-performance Node.js web framework
- **Prisma**: Modern database ORM with excellent TypeScript support

## Contact

For issues, feature requests, or contributions, please open an issue on the GitHub repository.

