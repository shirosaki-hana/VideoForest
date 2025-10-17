import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Box,
  IconButton,
  Stack,
  Chip,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import VideoPlayer from '../components/VideoPlayer';
import { getMediaInfo, getHLSPlaylistUrl } from '../api/streaming';
import { formatDuration, formatFileSize } from '../utils/format';
import type { MediaInfoResponse } from '@videoforest/types';

export default function PlayerPage() {
  const { mediaId } = useParams<{ mediaId: string }>();
  const navigate = useNavigate();

  const [mediaInfo, setMediaInfo] = useState<MediaInfoResponse['media'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState<string>('');

  useEffect(() => {
    if (!mediaId) {
      setError('Media ID is missing');
      setLoading(false);
      return;
    }

    // 미디어 정보 로드
    const loadMediaInfo = async () => {
      try {
        setLoading(true);
        const response = await getMediaInfo(mediaId);
        setMediaInfo(response.media);
        setPlaylistUrl(getHLSPlaylistUrl(mediaId));
        setError(null);
      } catch (err: any) {
        console.error('Failed to load media info:', err);
        setError(err.message || 'Failed to load media info');
      } finally {
        setLoading(false);
      }
    };

    loadMediaInfo();
  }, [mediaId]);

  const handleBack = () => {
    navigate('/');
  };

  const handlePlayerError = (error: any) => {
    console.error('Player error:', error);
    setError(`Playback error: ${error?.message || 'Unknown error'}`);
  };

  return (
    <Container maxWidth='xl' sx={{ py: 4 }}>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={handleBack} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant='h4' component='h1'>
          {mediaInfo?.name || 'Loading...'}
        </Typography>
      </Box>

      {/* 로딩 상태 */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={60} />
        </Box>
      )}

      {/* 에러 상태 */}
      {!loading && error && (
        <Alert severity='error' sx={{ mb: 4 }}>
          {error}
        </Alert>
      )}

      {/* 플레이어 */}
      {!loading && !error && playlistUrl && (
        <>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <VideoPlayer src={playlistUrl} onError={handlePlayerError} />
            </CardContent>
          </Card>

          {/* 미디어 정보 */}
          {mediaInfo && (
            <Card>
              <CardContent>
                <Typography variant='h6' gutterBottom>
                  Media Information
                </Typography>
                <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mt: 2 }}>
                  {mediaInfo.width && mediaInfo.height && (
                    <Chip label={`Resolution: ${mediaInfo.width}x${mediaInfo.height}`} variant='outlined' />
                  )}
                  {mediaInfo.duration && <Chip label={`Duration: ${formatDuration(mediaInfo.duration)}`} variant='outlined' />}
                  {mediaInfo.fileSize && <Chip label={`Size: ${formatFileSize(mediaInfo.fileSize)}`} variant='outlined' />}
                  {mediaInfo.codec && <Chip label={`Video: ${mediaInfo.codec.toUpperCase()}`} variant='outlined' />}
                  {mediaInfo.audioCodec && <Chip label={`Audio: ${mediaInfo.audioCodec.toUpperCase()}`} variant='outlined' />}
                  {mediaInfo.fps && <Chip label={`${Math.round(mediaInfo.fps)} FPS`} variant='outlined' />}
                  {mediaInfo.bitrate && (
                    <Chip label={`Bitrate: ${Math.round(mediaInfo.bitrate / 1000)} kbps`} variant='outlined' />
                  )}
                </Stack>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Container>
  );
}

