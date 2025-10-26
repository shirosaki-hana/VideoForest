import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  CircularProgress,
  Alert,
  Box,
  IconButton,
  Stack,
  Chip,
  Switch,
  FormControlLabel,
  Paper,
  useTheme,
  useMediaQuery,
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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
    <Box sx={{ width: '100%', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* 로딩/에러 상태 - 중앙 표시 */}
      {(loading || preparingStream || error) && (
        <Container maxWidth='lg' sx={{ py: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <IconButton onClick={handleBack} sx={{ mr: 2 }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant='h6' component='h1'>
              {mediaInfo?.name || 'Loading...'}
            </Typography>
          </Box>

          {loading && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 2 }}>
              <CircularProgress size={60} />
              <Typography variant='body1' color='text.secondary'>
                {t('player.loadingMedia')}
              </Typography>
            </Box>
          )}

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

          {!loading && error && <Alert severity='error'>{error}</Alert>}
        </Container>
      )}

      {/* 플레이어 및 컨텐츠 */}
      {!loading && !preparingStream && !error && playlistUrl && (
        <>
          {/* 비디오 플레이어 - 전체 너비, 여백 없음 */}
          <Box sx={{ width: '100%', bgcolor: 'black', position: 'relative', aspectRatio: '16/9' }}>
            <VideoPlayer src={playlistUrl} mediaId={mediaId!} onError={handlePlayerError} onEnded={handleVideoEnded} />
          </Box>

          {/* 컨텐츠 영역 */}
          <Container maxWidth='xl' disableGutters={isMobile} sx={{ py: isMobile ? 0 : 3 }}>
            <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 0 : 3 }}>
              {/* 왼쪽: 비디오 정보 및 컨트롤 */}
              <Box sx={{ flex: isMobile ? '1 1 auto' : '1 1 66.66%', minWidth: 0 }}>
                {/* 헤더 및 제목 */}
                <Paper elevation={0} sx={{ p: 2, mb: isMobile ? 0 : 2, borderRadius: isMobile ? 0 : 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <IconButton onClick={handleBack} sx={{ mr: 1 }} size='small'>
                      <ArrowBackIcon />
                    </IconButton>
                    <Typography variant={isMobile ? 'h6' : 'h5'} component='h1' sx={{ fontWeight: 600, flex: 1 }}>
                      {mediaInfo?.name}
                    </Typography>
                  </Box>

                  {/* 재생 컨트롤 */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, pt: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <IconButton onClick={handlePrevious} disabled={!prevFile} color='primary' size='large'>
                        <SkipPreviousIcon />
                      </IconButton>
                      <IconButton onClick={handleNext} disabled={!nextFile} color='primary' size='large'>
                        <SkipNextIcon />
                      </IconButton>
                      {playlist.length > 0 && (
                        <Typography variant='body2' color='text.secondary' sx={{ ml: 1 }}>
                          {currentIndex + 1} / {playlist.length}
                        </Typography>
                      )}
                    </Box>
                    <FormControlLabel
                      control={<Switch checked={autoPlayNext} onChange={e => setAutoPlayNext(e.target.checked)} />}
                      label={t('settings.playback.autoPlayNext')}
                    />
                  </Box>
                </Paper>

                {/* 미디어 정보 */}
                {mediaInfo && (
                  <Paper elevation={0} sx={{ p: 2, borderRadius: isMobile ? 0 : 1 }}>
                    <Typography variant='subtitle1' gutterBottom sx={{ fontWeight: 600 }}>
                      {t('player.mediaInfo')}
                    </Typography>
                    <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mt: 2 }}>
                      {mediaInfo.width && mediaInfo.height && (
                        <Chip label={`${mediaInfo.width}×${mediaInfo.height}`} size='small' variant='outlined' />
                      )}
                      {mediaInfo.duration && <Chip label={formatDuration(mediaInfo.duration)} size='small' variant='outlined' />}
                      {mediaInfo.fileSize && <Chip label={formatFileSize(mediaInfo.fileSize)} size='small' variant='outlined' />}
                      {mediaInfo.codec && <Chip label={mediaInfo.codec.toUpperCase()} size='small' variant='outlined' />}
                      {mediaInfo.audioCodec && <Chip label={mediaInfo.audioCodec.toUpperCase()} size='small' variant='outlined' />}
                      {mediaInfo.fps && <Chip label={`${Math.round(mediaInfo.fps)} FPS`} size='small' variant='outlined' />}
                      {mediaInfo.bitrate && <Chip label={`${Math.round(mediaInfo.bitrate / 1000)} kbps`} size='small' variant='outlined' />}
                    </Stack>
                  </Paper>
                )}
              </Box>

              {/* 오른쪽: 플레이리스트 (데스크탑) 또는 아래 (모바일) */}
              {playlist.length > 1 && (
                <Box sx={{ flex: isMobile ? '1 1 auto' : '1 1 33.33%', minWidth: 0 }}>
                  <Paper
                    elevation={isMobile ? 0 : 1}
                    sx={{
                      borderRadius: isMobile ? 0 : 1,
                      maxHeight: isMobile ? 'auto' : 'calc(100vh - 400px)',
                      overflow: 'auto',
                    }}
                  >
                    <Box
                      sx={{
                        p: 2,
                        position: 'sticky',
                        top: 0,
                        bgcolor: 'background.paper',
                        zIndex: 1,
                        borderBottom: 1,
                        borderColor: 'divider',
                      }}
                    >
                      <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
                        {t('player.playlist', { count: playlist.length })}
                      </Typography>
                    </Box>
                    <Stack spacing={0} sx={{ p: 1 }}>
                      {playlist.map((file, index) => (
                        <Box
                          key={file.id}
                          onClick={() => navigate(`/player/${file.id}`)}
                          sx={{
                            p: 1.5,
                            borderRadius: 1,
                            cursor: 'pointer',
                            bgcolor: file.id === mediaId ? 'primary.main' : 'transparent',
                            color: file.id === mediaId ? 'primary.contrastText' : 'text.primary',
                            '&:hover': {
                              bgcolor: file.id === mediaId ? 'primary.dark' : 'action.hover',
                            },
                            transition: 'background-color 0.2s',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                            <Typography
                              variant='body2'
                              color={file.id === mediaId ? 'inherit' : 'text.secondary'}
                              sx={{ minWidth: 24, fontWeight: file.id === mediaId ? 'bold' : 'normal', mt: 0.2 }}
                            >
                              {index + 1}
                            </Typography>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography
                                variant='body2'
                                sx={{
                                  fontWeight: file.id === mediaId ? 600 : 400,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  lineHeight: 1.4,
                                }}
                              >
                                {file.name}
                              </Typography>
                              {file.duration && (
                                <Typography variant='caption' sx={{ opacity: 0.8, display: 'block', mt: 0.5 }}>
                                  {formatDuration(file.duration)}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  </Paper>
                </Box>
              )}
            </Box>
          </Container>
        </>
      )}
    </Box>
  );
}
