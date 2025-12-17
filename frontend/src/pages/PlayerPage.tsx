import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, useTheme, useMediaQuery, Container, Paper } from '@mui/material';
import VideoPlayer, { type PlayerError } from '../components/VideoPlayer';
import PlayerLoadingState from '../components/Player/PlayerLoadingState';
import PlayerHeader from '../components/Player/PlayerHeader';
import PlayerControls from '../components/Player/PlayerControls';
import MediaInfo from '../components/Player/MediaInfo';
import Playlist from '../components/Player/Playlist';
import { getMediaInfo, getHLSPlaylistUrl, waitForPlaylist } from '../api/streaming';
import { useMediaStore } from '../stores/mediaStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useWatchHistoryStore } from '../stores/watchHistoryStore';
import { getNextFile, getPreviousFile, getSiblingFiles } from '../utils/mediaTree';
import { dialog } from '../stores/dialogStore';
import { snackbar } from '../stores/snackbarStore';
import type { MediaInfoResponse, MediaTreeNode } from '@videoforest/types';

export default function PlayerPage() {
  const { mediaId } = useParams<{ mediaId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [mediaInfo, setMediaInfo] = useState<MediaInfoResponse['media'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparingStream, setPreparingStream] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState<string>('');

  // 미디어 트리와 자동재생 설정
  const { mediaTree } = useMediaStore();
  const { autoPlayNext, setAutoPlayNext } = useSettingsStore();
  const markAsWatched = useWatchHistoryStore(state => state.markAsWatched);

  // 재생 목록 정보
  const [playlist, setPlaylist] = useState<MediaTreeNode[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [nextFile, setNextFile] = useState<MediaTreeNode | null>(null);
  const [prevFile, setPrevFile] = useState<MediaTreeNode | null>(null);

  useEffect(() => {
    if (!mediaId) {
      dialog.error(t('player.errors.missingId')).then(() => navigate('/'));
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

        // 1. 미디어 정보 먼저 로드
        const response = await getMediaInfo(mediaId, signal);
        if (signal.aborted) return;
        setMediaInfo(response.media);
        setLoading(false);

        // 2. 스트리밍 준비 대기 (Playlist가 생성될 때까지)
        const isReady = await waitForPlaylist(mediaId, 180000, signal); // 최대 180초 대기
        if (signal.aborted) return;

        if (isReady) {
          setPlaylistUrl(getHLSPlaylistUrl(mediaId));
          setPreparingStream(false);
          // 재생 시작 시 시청 완료로 마킹
          markAsWatched(mediaId);
        } else {
          throw new Error('streamTimeout');
        }
      } catch (err: unknown) {
        if (signal.aborted || (err && typeof err === 'object' && 'code' in err && err.code === 'ERR_CANCELED')) {
          return; // 취소 시 무시
        }
        const errorKey =
          err instanceof Error && err.message === 'streamTimeout' ? 'player.errors.streamTimeout' : 'player.errors.loadFailed';
        dialog.error(t(errorKey)).then(() => navigate('/'));
        setLoading(false);
        setPreparingStream(false);
      }
    };

    loadMediaAndPrepareStream();

    return () => {
      abortController.abort();
    };
  }, [mediaId, navigate, t, markAsWatched]);

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
    // 재생 에러는 스낵바로 표시 (3초 후에도 실패하면)
    setTimeout(() => {
      snackbar.error(`Playback error: ${errorMessage}`);
    }, 3000);
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
      {/* 로딩 상태 */}
      <PlayerLoadingState loading={loading} preparingStream={preparingStream} mediaName={mediaInfo?.name} onBack={handleBack} />

      {/* 플레이어 및 컨텐츠 */}
      {!loading && !preparingStream && playlistUrl && (
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
                <PlayerHeader mediaName={mediaInfo?.name || ''} onBack={handleBack} />

                {/* 재생 컨트롤 */}
                <Paper elevation={0} sx={{ p: 2, mb: isMobile ? 0 : 2, borderRadius: isMobile ? 0 : 1 }}>
                  <PlayerControls
                    prevFile={prevFile}
                    nextFile={nextFile}
                    currentIndex={currentIndex}
                    playlistLength={playlist.length}
                    autoPlayNext={autoPlayNext}
                    onPrevious={handlePrevious}
                    onNext={handleNext}
                    onAutoPlayChange={setAutoPlayNext}
                  />
                </Paper>

                {/* 미디어 정보 */}
                {mediaInfo && <MediaInfo mediaInfo={mediaInfo} />}
              </Box>

              {/* 오른쪽: 플레이리스트 (데스크탑) 또는 아래 (모바일) */}
              <Playlist playlist={playlist} currentMediaId={mediaId!} onSelectMedia={id => navigate(`/player/${id}`)} />
            </Box>
          </Container>
        </>
      )}
    </Box>
  );
}
