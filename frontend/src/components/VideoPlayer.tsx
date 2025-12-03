import { useEffect, useRef } from 'react';
import { MediaPlayer, MediaProvider, type MediaPlayerInstance, type MediaErrorDetail, isHLSProvider } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import HLS from 'hls.js';

export type PlayerError = MediaErrorDetail | null;

interface VideoPlayerProps {
  src: string;
  mediaId: string;
  onReady?: (player: MediaPlayerInstance) => void;
  onEnded?: () => void;
  onError?: (error: PlayerError) => void;
}

export default function VideoPlayer({ src, mediaId, onReady, onEnded, onError }: VideoPlayerProps) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const prevMediaIdRef = useRef<string | null>(null);
  const shouldAutoPlayRef = useRef(false);

  // 미디어 변경 감지 - 실제 재생은 canPlay 이벤트에서 처리
  useEffect(() => {
    if (prevMediaIdRef.current !== mediaId) {
      // 첫 로드가 아닌 미디어 변경 시에만 자동 재생 플래그 설정
      if (prevMediaIdRef.current !== null) {
        shouldAutoPlayRef.current = true;
      }
      prevMediaIdRef.current = mediaId;
    }
  }, [mediaId]);

  const handleCanPlay = () => {
    // 미디어가 준비된 후 자동 재생 (JIT 트랜스코딩 로딩 시간 고려)
    if (shouldAutoPlayRef.current && playerRef.current) {
      shouldAutoPlayRef.current = false;
      playerRef.current.play();
    }
    if (onReady && playerRef.current) {
      onReady(playerRef.current);
    }
  };

  const handleEnded = () => {
    if (onEnded) {
      onEnded();
    }
  };

  const handleError = (detail: MediaErrorDetail) => {
    if (onError) {
      onError(detail);
    }
  };

  return (
    <MediaPlayer
      ref={playerRef}
      src={src}
      viewType='video'
      streamType='on-demand'
      crossOrigin='use-credentials'
      playsInline
      onCanPlay={handleCanPlay}
      onEnded={handleEnded}
      onError={handleError}
      onProviderChange={provider => {
        // HLS.js에 로컬 번들 라이브러리 및 withCredentials 설정 (쿠키 인증용)
        if (isHLSProvider(provider)) {
          provider.library = HLS;
          provider.config = {
            ...provider.config,
            xhrSetup: (xhr: XMLHttpRequest) => {
              xhr.withCredentials = true;
            },
          };
        }
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <MediaProvider />
      <DefaultVideoLayout icons={defaultLayoutIcons} />
    </MediaPlayer>
  );
}
