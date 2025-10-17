import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

type Player = ReturnType<typeof videojs>;

interface VideoPlayerProps {
  src: string;
  onReady?: (player: Player) => void;
  onEnded?: () => void;
  onError?: (error: videojs.MediaError | null) => void;
}

export default function VideoPlayer({ src, onReady, onEnded, onError }: VideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    // 플레이어가 이미 초기화되어 있으면 무시
    if (playerRef.current) {
      return;
    }

    // Video.js 플레이어 생성
    const videoElement = document.createElement('video-js');
    videoElement.classList.add('vjs-big-play-centered');
    videoRef.current?.appendChild(videoElement);

    const player = videojs(
      videoElement,
      {
        controls: true,
        responsive: true,
        fluid: true,
        preload: 'auto',
        html5: {
          vhs: {
            // HLS 스트리밍 옵션
            enableLowInitialPlaylist: true,
            smoothQualityChange: true,
            overrideNative: true,
          },
        },
        sources: [
          {
            src,
            type: 'application/x-mpegURL',
          },
        ],
      },
      () => {
        // 플레이어 준비 완료
        if (onReady) {
          onReady(player);
        }
      }
    );

    // 이벤트 리스너 등록
    if (onEnded) {
      player.on('ended', onEnded);
    }

    if (onError) {
      player.on('error', () => {
        const error = player.error();
        onError(error);
      });
    }

    playerRef.current = player;

    // 컴포넌트 언마운트 시 플레이어 정리
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [src, onReady, onEnded, onError]);

  return (
    <div data-vjs-player>
      <div ref={videoRef} />
    </div>
  );
}
