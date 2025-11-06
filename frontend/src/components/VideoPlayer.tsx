import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

type Player = ReturnType<typeof videojs>;
export type PlayerError = ReturnType<Player['error']>;

interface VideoPlayerProps {
  src: string;
  mediaId: string;
  onReady?: (player: Player) => void;
  onEnded?: () => void;
  onError?: (error: PlayerError) => void;
}

export default function VideoPlayer({ src, mediaId, onReady, onEnded, onError }: VideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const prevMediaIdRef = useRef<string | null>(null);

  // 플레이어 초기화 (한 번만 실행)
  useEffect(() => {
    // 이미 초기화되어 있으면 스킵
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
            withCredentials: true, // 쿠키 인증 지원
          },
          nativeAudioTracks: false,
          nativeVideoTracks: false,
        },
      },
      () => {
        // HLS 요청에 쿠키 포함 (쿠키 기반 인증용)
        const tech = player.tech({ IWillNotUseThisInPlugins: true }) as {
          vhs?: { xhr?: { beforeRequest?: (options: { withCredentials?: boolean }) => { withCredentials?: boolean } } };
        };
        if (tech?.vhs) {
          const vhs = tech.vhs;
          if (vhs && vhs.xhr && typeof vhs.xhr === 'object') {
            vhs.xhr.beforeRequest = (options: { withCredentials?: boolean }) => {
              // XMLHttpRequest에 withCredentials 설정하여 쿠키 포함
              options.withCredentials = true;
              return options;
            };
          }
        }

        if (onReady) {
          onReady(player);
        }
      }
    );

    playerRef.current = player;

    // cleanup: 컴포넌트 언마운트 시에만 플레이어 정리
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 의존성 없음 - 한 번만 실행 (onReady는 의도적으로 제외)

  // src 변경 감지 및 동적 업데이트 (플레이어 재생성 없이)
  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed()) {
      return;
    }

    // 미디어가 실제로 변경되었을 때만 src 업데이트
    if (prevMediaIdRef.current !== mediaId) {
      prevMediaIdRef.current = mediaId;

      // 기존 소스와 다르면 새 소스로 변경
      player.src({
        src,
        type: 'application/x-mpegURL',
      });

      // 자동 재생 (소스 변경 후)
      player.ready(() => {
        player.play();
      });
    }
  }, [src, mediaId]);

  // 이벤트 핸들러 등록/업데이트 (플레이어 재생성 없이)
  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed()) {
      return;
    }

    // 이전 리스너 제거 후 새로운 리스너 등록
    player.off('ended');
    player.off('error');

    if (onEnded) {
      player.on('ended', onEnded);
    }

    if (onError) {
      player.on('error', () => {
        const error = player.error();
        onError(error);
      });
    }

    return () => {
      // cleanup: 이벤트 리스너만 제거 (플레이어는 유지)
      player.off('ended');
      player.off('error');
    };
  }, [onEnded, onError]);

  return (
    <div data-vjs-player>
      <div ref={videoRef} />
    </div>
  );
}
