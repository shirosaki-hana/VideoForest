<div align="center">
  <img src="assets/symbol_original.png" alt="VideoForest" width="180" />
  <h1>VideoForest</h1>
  <p>A self-hosted video streaming server with just-in-time (JIT) transcoding for resource-constrained home servers.</p>

  [![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![Node](https://img.shields.io/badge/Node.js-≥24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
  [![pnpm](https://img.shields.io/badge/pnpm-≥10-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
</div>

---

Delivers HLS streams with automatic quality adaptation without pre-processing entire video libraries.

## Overview

VideoForest is designed to run on personal NAS or home servers with limited resources. Instead of pre-transcoding all media files, it employs sophisticated JIT transcoding that generates HLS segments on-demand only when requested. Transcoded segments are permanently cached for reuse.

### Key Features

- **JIT Transcoding**: Segments are transcoded only when requested, minimizing upfront storage and processing requirements
- **Persistent Caching**: Once transcoded, segments are stored permanently and reused across sessions
- **Hardware Acceleration**: Automatic detection with fallback chain (NVENC → QSV → CPU)
- **Multiple Quality Profiles**: Adaptive bitrate streaming with automatic profile selection based on source media
- **Efficient Seeking**: Back-seeking and quality switching work seamlessly without re-transcoding
- **Modern Web Interface**: React-based frontend with Material UI and Vidstack player
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
- **Vidstack**: Modern HTML5 video player with HLS support
- **Zustand**: State management
- **i18next**: Internationalization

### Transcoding Strategy

1. Media duration is analyzed on first access
2. HLS playlist is generated based on total duration
3. Segments are transcoded on-demand when requested by the player
4. Hardware acceleration is automatically detected with fallback chain: NVENC → QSV → CPU
5. Transcoded segments are permanently cached on disk
6. Subsequent requests serve cached segments directly

## Requirements

- Node.js 24 or later
- pnpm 10 or later
- FFmpeg with libx264 support (automatically installed via npm packages)

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

Copy the example environment file and modify as needed:

```bash
cp .env.example .env
```

### Environment Variables

> **Note**: Duration values accept units: `ms`, `s`, `m`, `h`, `d`, `w`. Defaults to `ms` if no unit specified.

#### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Set to `development` to relax CORS and security headers, and perform segment validations. |
| `HOST` | `127.0.0.1` | IP address to bind the server |
| `PORT` | `4001` | Server port number |
| `FRONTEND_URL` | `http://127.0.0.1:4001` | Frontend URL for CORS (restricted in production mode) |

#### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL_SQLITE` | `file:./prisma/videoforest.db` | Path to SQLite database file |

#### Security & Session

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_COOKIE` | `session` | Name of the session cookie |
| `SESSION_TTL` | `24h` | Session expiration time |
| `REQUEST_BODY_LIMIT` | `10mb` | Maximum HTTP request body size |
| `RATELIMIT_MAX` | `100` | Max requests within the rate limit window |
| `RATELIMIT_WINDOWMS` | `10s` | Rate limit time window |

#### Transcoding

| Variable | Default | Description |
|----------|---------|-------------|
| `MEDIA_PATHS` | `media/` | Directories to scan for media files (comma-separated) |
| `HLS_TEMP_DIR` | `temp/` | Directory for cached HLS segments |
| `VIDEOFOREST_SPEED_MODE` | `true` | Enable faster encoding (trades quality for speed) |
| `VIDEOFOREST_ENCODER` | `Auto` | Hardware encoder: `Auto`, `NVENC`, `QSV`, `CPU` |

#### Prefetching

Prefetching transcodes upcoming segments ahead of time for smoother playback.

| Variable | Default | Description |
|----------|---------|-------------|
| `VIDEOFOREST_PREFETCH_ENABLED` | `true` | Enable segment prefetching |
| `VIDEOFOREST_PREFETCH_COUNT` | `3` | Number of segments to prefetch ahead |
| `VIDEOFOREST_MAX_CONCURRENT_PREFETCH` | `2` | Maximum concurrent prefetch jobs |

## Running the Application

### Database Deployment

Perform migrations for the SQLite database:

```bash
pnpm db:deploy
```

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

## Docker Deployment

VideoForest supports Docker deployment with hardware acceleration options for NVIDIA and Intel GPUs.

### Quick Start

1. Copy the example environment file:

```bash
cp env.example .env
```

2. Edit `.env` and set your media library path:

```env
MEDIA_PATH_1=/path/to/your/media/library
MEDIA_PATHS=/media/library1
```

3. Start the container:

```bash
# CPU only (default)
docker compose up -d

# With NVIDIA GPU (NVENC)
docker compose --profile nvidia up -d

# With Intel GPU (QSV)
docker compose --profile intel up -d
```

4. Access the application at `http://localhost:4001`

### Hardware Acceleration

#### NVIDIA GPU (NVENC)

Requires [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html):

```bash
# Install NVIDIA Container Toolkit (Ubuntu/Debian)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Run with NVIDIA profile
docker compose --profile nvidia up -d
```

#### Intel GPU (QSV)

Requires Intel GPU drivers on the host:

```bash
# Check render group ID
getent group render

# Update group_add in docker-compose.yml if different from 109
# Then run with Intel profile
docker compose --profile intel up -d
```

### Multiple Media Libraries

To mount multiple media directories, edit `docker-compose.yml`:

```yaml
volumes:
  - ${MEDIA_PATH_1:-./media}:/media/library1:ro
  - ${MEDIA_PATH_2:-./media2}:/media/library2:ro
  - ${MEDIA_PATH_3:-./media3}:/media/library3:ro
```

Then update `.env`:

```env
MEDIA_PATH_1=/mnt/nas/movies
MEDIA_PATH_2=/mnt/nas/tvshows
MEDIA_PATH_3=/mnt/external/videos
MEDIA_PATHS=/media/library1,/media/library2,/media/library3
```

### Data Persistence

- **Database**: Stored in `videoforest-data` Docker volume
- **HLS Cache**: Stored in `videoforest-temp` Docker volume

To backup the database:

```bash
docker cp videoforest:/app/data/videoforest.db ./backup/
```

### Building from Source

```bash
docker compose build
```

## Docker Deployment

VideoForest supports Docker deployment with hardware acceleration options for NVIDIA and Intel GPUs.

### Quick Start

1. Copy the example environment file:

```bash
cp env.docker.example .env
```

2. Edit `.env` and set your media library path:

```env
MEDIA_PATH_1=/path/to/your/media/library
MEDIA_PATHS=/media/library1
```

3. Start the container:

```bash
# CPU only (default)
docker compose up -d

# With NVIDIA GPU (NVENC)
docker compose --profile nvidia up -d

# With Intel GPU (QSV)
docker compose --profile intel up -d
```

4. Access the application at `http://localhost:4001`

### Hardware Acceleration

#### NVIDIA GPU (NVENC)

Requires [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html):

```bash
# Install NVIDIA Container Toolkit (Ubuntu/Debian)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Run with NVIDIA profile
docker compose --profile nvidia up -d
```

#### Intel GPU (QSV)

Requires Intel GPU drivers on the host:

```bash
# Check render group ID
getent group render

# Update group_add in docker-compose.yml if different from 109
# Then run with Intel profile
docker compose --profile intel up -d
```

### Multiple Media Libraries

To mount multiple media directories, edit `docker-compose.yml`:

```yaml
volumes:
  - ${MEDIA_PATH_1:-./media}:/media/library1:ro
  - ${MEDIA_PATH_2:-./media2}:/media/library2:ro
  - ${MEDIA_PATH_3:-./media3}:/media/library3:ro
```

Then update `.env`:

```env
MEDIA_PATH_1=/mnt/nas/movies
MEDIA_PATH_2=/mnt/nas/tvshows
MEDIA_PATH_3=/mnt/external/videos
MEDIA_PATHS=/media/library1,/media/library2,/media/library3
```

### Data Persistence

- **Database**: Stored in `videoforest-data` Docker volume
- **HLS Cache**: Stored in `videoforest-temp` Docker volume

To backup the database:

```bash
docker cp videoforest:/app/data/videoforest.db ./backup/
```

### Building from Source

```bash
docker compose build
```

## License

MIT License. See [LICENSE](LICENSE) for details.

