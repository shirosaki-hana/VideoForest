# VideoForest Backend API Documentation

## Overview

The VideoForest backend is built with Fastify and provides a REST API for video library management and HLS streaming with JIT transcoding.

Base URL: `/api`

## Authentication

Most endpoints require authentication via session cookie. The session cookie name is configurable via environment variables.

## API Endpoints

### Authentication Routes (`/api/auth`)

#### GET /api/auth/status

Check authentication status and initial setup state.

**Response:**

```json
{
  "isSetup": boolean,
  "isAuthenticated": boolean
}
```

#### POST /api/auth/setup

Initial password setup (only available when password is not set).

**Request Body:**

```json
{
  "password": string
}
```

**Response:**

```json
{
  "success": true
}
```

#### POST /api/auth/login

Authenticate and receive session cookie.

**Request Body:**

```json
{
  "password": string
}
```

**Response:**

```json
{
  "success": true
}
```

Sets session cookie on success.

#### POST /api/auth/logout

Invalidate session and clear cookie.

**Response:**

```json
{
  "success": true
}
```

### Media Management Routes (`/api/v1`)

All endpoints require authentication.

#### GET /api/v1/refresh

Scan media directory and refresh library database.

**Response:**

```json
{
  "success": true,
  "count": number,
  "media": [
    {
      "id": string,
      "name": string,
      "path": string,
      "duration": number,
      "width": number,
      "height": number,
      "codec": string,
      "bitrate": number | null,
      "fps": number,
      "audioCodec": string | null,
      "fileSize": number | null,
      "createdAt": string,
      "updatedAt": string
    }
  ]
}
```

#### GET /api/v1/list

Get all media items from the database.

**Response:**

```json
{
  "success": true,
  "count": number,
  "media": [
    {
      "id": string,
      "name": string,
      "path": string,
      "duration": number,
      "width": number,
      "height": number,
      "codec": string,
      "bitrate": number | null,
      "fps": number,
      "audioCodec": string | null,
      "fileSize": number | null,
      "createdAt": string,
      "updatedAt": string
    }
  ]
}
```

#### GET /api/v1/tree

Get media library as hierarchical tree structure.

**Response:**

```json
{
  "success": true,
  "tree": {
    "name": string,
    "path": string,
    "type": "folder" | "file",
    "children": [...],
    "mediaId"?: string
  }
}
```

#### GET /api/v1/scan

Scan media library with real-time progress updates via Server-Sent Events.

**Response:** Event stream with the following event types:

Start event:

```json
{
  "type": "start",
  "message": string
}
```

Progress event:

```json
{
  "type": "progress",
  "current": number,
  "total": number,
  "fileName": string
}
```

Complete event:

```json
{
  "type": "complete",
  "total": number,
  "success": number,
  "failed": number
}
```

Error event:

```json
{
  "type": "error",
  "message": string
}
```

### Streaming Routes (`/api/stream`)

All endpoints require authentication.

#### GET /api/stream/hls/:mediaId/master.m3u8

Get HLS master playlist for adaptive bitrate streaming.

**Parameters:**

- `mediaId` (path): Media item ID

**Response:** HLS master playlist (application/vnd.apple.mpegurl)

Automatically initializes transcoding cache and generates quality playlists.

#### GET /api/stream/hls/:mediaId/:quality/playlist.m3u8

Get HLS variant playlist for specific quality.

**Parameters:**

- `mediaId` (path): Media item ID
- `quality` (path): Quality level (e.g., "360p", "720p", "1080p")

**Response:** HLS variant playlist (application/vnd.apple.mpegurl)

#### GET /api/stream/hls/:mediaId/:quality/:segmentName

Get HLS video segment with JIT transcoding.

**Parameters:**

- `mediaId` (path): Media item ID
- `quality` (path): Quality level
- `segmentName` (path): Segment filename (format: `segment_XXX.ts`)

**Response:** MPEG-TS video segment (video/mp2t)

Segments are transcoded on-demand and cached permanently. Cached segments are served immediately.

#### GET /api/stream/media/:mediaId

Get media metadata for playback.

**Parameters:**

- `mediaId` (path): Media item ID

**Response:**

```json
{
  "success": true,
  "media": {
    "id": string,
    "name": string,
    "duration": number,
    "width": number,
    "height": number,
    "codec": string,
    "bitrate": number | null,
    "fps": number,
    "audioCodec": string | null,
    "fileSize": number | null
  }
}
```

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "error": string,
  "message"?: string,
  "stack"?: string
}
```

Common HTTP status codes:

- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (authentication required)
- `404` - Not Found (resource not found)
- `500` - Internal Server Error
