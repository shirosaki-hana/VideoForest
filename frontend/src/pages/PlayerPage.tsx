import { useEffect, useState, useCallback } from 'react';
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
  Switch,
  FormControlLabel,
  Divider,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, SkipNext as SkipNextIcon, SkipPrevious as SkipPreviousIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import VideoPlayer, { type PlayerError } from '../components/VideoPlayer';
import { getMediaInfo, getHLSPlaylistUrl, waitForPlaylist } from '../api/streaming';
import { formatDuration, formatFileSize } from '../utils/format';
import { useMediaStore } from '../stores/mediaStore';
import { useSettingsStore } from '../stores/settingsStore';
import { getNextFile, getPreviousFile, getSiblingFiles } from '../utils/mediaTree';
import type { MediaInfoResponse, MediaTreeNode } from '@videoforest/types';

export default function PlayerPage() {
  const { t } = useTranslation();
  const { mediaId } = useParams<{ mediaId: string }>();
  const navigate = useNavigate();

  const [mediaInfo, setMediaInfo] = useState<MediaInfoResponse['media'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparingStream, setPreparingStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState<string>('');

  // 미디어 트리와 자동재생 설정
  const { mediaTree } = useMediaStore();
  const { autoPlayNext, setAutoPlayNext } = useSettingsStore();

  // 재생 목록 정보
  const [playlist, setPlaylist] = useState<MediaTreeNode[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [nextFile, setNextFile] = useState<MediaTreeNode | null>(null);
  const [prevFile, setPrevFile] = useState<MediaTreeNode | null>(null);

  useEffect(() => {
    if (!mediaId) {
      setError('Media ID is missing');
      setLoading(false);
      return;
    }

    const abortController = new AbortController();
    const { signal } = abortController;

    // 미디어 정보 로드 및 스트리밍 준비
    const loadMediaAndPrepareStream = async () => {
      try {
        setLoading(true);
        setPreparingStream(true);
        setError(null);

        // 1. 미디어 정보 먼저 로드
        const response = await getMediaInfo(mediaId, signal);
        if (signal.aborted) return;
        setMediaInfo(response.media);
        setLoading(false);

        // 2. 스트리밍 준비 대기 (Playlist가 생성될 때까지)
        const isReady = await waitForPlaylist(mediaId, 30000, signal); // 최대 30초 대기
        if (signal.aborted) return;

        if (isReady) {
          setPlaylistUrl(getHLSPlaylistUrl(mediaId));
          setPreparingStream(false);
        } else {
          throw new Error('Stream preparation failed or timeout. Please try again.');
        }
      } catch (err: unknown) {
        if (signal.aborted || (err && typeof err === 'object' && 'code' in err && err.code === 'ERR_CANCELED')) {
          return; // 취소 시 무시
        }
        const errorMessage = err instanceof Error ? err.message : 'Failed to load media info';
        setError(errorMessage);
        setLoading(false);
        setPreparingStream(false);
      }
    };

    loadMediaAndPrepareStream();

    return () => {
      abortController.abort();
    };
  }, [mediaId]);

  // 재생 목록 업데이트
  useEffect(() => {
    if (!mediaId || !mediaTree.length) return;

    const siblingFiles = getSiblingFiles(mediaTree, mediaId);
    setPlaylist(siblingFiles);

    const currentIdx = siblingFiles.findIndex(f => f.id === mediaId);
    setCurrentIndex(currentIdx);

    const next = getNextFile(mediaTree, mediaId);
    const prev = getPreviousFile(mediaTree, mediaId);
    setNextFile(next);
    setPrevFile(prev);
  }, [mediaId, mediaTree]);

  const handleBack = () => {
    navigate('/');
  };

  // useCallback으로 메모이제이션하여 리렌더링 시 재생성 방지
  const handlePlayerError = useCallback((error: PlayerError) => {
    const errorMessage = error?.message || 'Unknown error';
    // 에러가 발생해도 바로 상태를 업데이트하지 않음
    // 폴백이 진행 중일 수 있으므로 재시도 기회를 줌
    setTimeout(() => {
      setError(`Playback error: ${errorMessage}`);
    }, 3000); // 3초 후에도 실패하면 에러 표시
  }, []);

  // 비디오 종료 시 자동으로 다음 파일 재생
  const handleVideoEnded = useCallback(() => {
    if (autoPlayNext && nextFile) {
      navigate(`/player/${nextFile.id}`);
    }
  }, [autoPlayNext, nextFile, navigate]);

  // 다음 파일로 이동
  const handleNext = () => {
    if (nextFile) {
      navigate(`/player/${nextFile.id}`);
    }
  };

  // 이전 파일로 이동
  const handlePrevious = () => {
    if (prevFile) {
      navigate(`/player/${prevFile.id}`);
    }
  };

  return (
    <Container maxWidth='xl' sx={{ py: 4 }}>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={handleBack} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant='h4' component='h1' sx={{ flexGrow: 1 }}>
          {mediaInfo?.name || 'Loading...'}
        </Typography>
      </Box>

      {/* 로딩 상태 */}
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 2 }}>
          <CircularProgress size={60} />
          <Typography variant='body1' color='text.secondary'>
            {t('player.loadingMedia')}
          </Typography>
        </Box>
      )}

      {/* 스트리밍 준비 중 */}
      {!loading && preparingStream && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 2 }}>
          <CircularProgress size={60} />
          <Typography variant='body1' color='text.secondary'>
            {t('player.preparingStream')}
          </Typography>
          <Typography variant='caption' color='text.secondary'>
            {t('player.preparingStreamDesc')}
          </Typography>
        </Box>
      )}

      {/* 에러 상태 */}
      {!loading && error && (
        <Alert severity='error' sx={{ mb: 4 }}>
          {error}
        </Alert>
      )}

      {/* 플레이어 */}
      {!loading && !preparingStream && !error && playlistUrl && (
        <>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <VideoPlayer src={playlistUrl} mediaId={mediaId!} onError={handlePlayerError} onEnded={handleVideoEnded} />
            </CardContent>
          </Card>

          {/* 재생 컨트롤 */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <IconButton onClick={handlePrevious} disabled={!prevFile} color='primary' size='large'>
                    <SkipPreviousIcon />
                  </IconButton>
                  <IconButton onClick={handleNext} disabled={!nextFile} color='primary' size='large'>
                    <SkipNextIcon />
                  </IconButton>
                  {playlist.length > 0 && (
                    <Typography variant='body2' sx={{ ml: 2 }}>
                      {currentIndex + 1} / {playlist.length}
                    </Typography>
                  )}
                </Box>
                <FormControlLabel
                  control={<Switch checked={autoPlayNext} onChange={e => setAutoPlayNext(e.target.checked)} />}
                  label={t('settings.playback.autoPlayNext')}
                />
              </Box>
            </CardContent>
          </Card>

          {/* 재생 목록 */}
          {playlist.length > 1 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant='h6' gutterBottom>
                  {t('player.playlist', { count: playlist.length })}
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Stack spacing={1}>
                  {playlist.map((file, index) => (
                    <Box
                      key={file.id}
                      onClick={() => navigate(`/player/${file.id}`)}
                      sx={{
                        p: 1.5,
                        borderRadius: 1,
                        cursor: 'pointer',
                        bgcolor: file.id === mediaId ? 'primary.main' : 'action.hover',
                        color: file.id === mediaId ? 'primary.contrastText' : 'text.primary',
                        '&:hover': {
                          bgcolor: file.id === mediaId ? 'primary.dark' : 'action.selected',
                        },
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      <Typography variant='body2' sx={{ minWidth: 30, fontWeight: file.id === mediaId ? 'bold' : 'normal' }}>
                        {index + 1}.
                      </Typography>
                      <Typography variant='body2' sx={{ flexGrow: 1, fontWeight: file.id === mediaId ? 'bold' : 'normal' }}>
                        {file.name}
                      </Typography>
                      {file.duration && (
                        <Typography variant='caption' sx={{ opacity: 0.7 }}>
                          {formatDuration(file.duration)}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* 미디어 정보 */}
          {mediaInfo && (
            <Card>
              <CardContent>
                <Typography variant='h6' gutterBottom>
                  {t('player.mediaInfo')}
                </Typography>
                <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mt: 2 }}>
                  {mediaInfo.width && mediaInfo.height && (
                    <Chip label={`${t('player.resolution')}: ${mediaInfo.width}x${mediaInfo.height}`} variant='outlined' />
                  )}
                  {mediaInfo.duration && <Chip label={`${t('player.playTime')}: ${formatDuration(mediaInfo.duration)}`} variant='outlined' />}
                  {mediaInfo.fileSize && <Chip label={`${t('player.fileSize')}: ${formatFileSize(mediaInfo.fileSize)}`} variant='outlined' />}
                  {mediaInfo.codec && <Chip label={`${t('player.video')}: ${mediaInfo.codec.toUpperCase()}`} variant='outlined' />}
                  {mediaInfo.audioCodec && <Chip label={`${t('player.audio')}: ${mediaInfo.audioCodec.toUpperCase()}`} variant='outlined' />}
                  {mediaInfo.fps && <Chip label={`${Math.round(mediaInfo.fps)} FPS`} variant='outlined' />}
                  {mediaInfo.bitrate && <Chip label={`${t('player.bitrate')}: ${Math.round(mediaInfo.bitrate / 1000)} kbps`} variant='outlined' />}
                </Stack>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Container>
  );
}
