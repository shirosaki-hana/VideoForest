import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { stopStreaming } from '../api/streaming';

type Player = ReturnType<typeof videojs>;
type PlayerError = ReturnType<Player['error']>;

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
  const isMountedRef = useRef(true);  // 컴포넌트가 마운트되어 있는지 추적

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
            // 단일 품질 HLS 최적화 설정
            overrideNative: true,                 // VHS 사용 (Safari도 포함)
            withCredentials: true,                // 쿠키 인증 지원
          },
          nativeAudioTracks: false,
          nativeVideoTracks: false,
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
        console.log('Video.js player ready');
        
        // HLS 요청에 쿠키 포함 (쿠키 기반 인증용)
        const tech = player.tech({ IWillNotUseThisInPlugins: true }) as any;
        if (tech?.vhs) {
          const vhs = tech.vhs;
          if (vhs && typeof vhs.xhr === 'object') {
            vhs.xhr.beforeRequest = (options: any) => {
              // XMLHttpRequest에 withCredentials 설정하여 쿠키 포함
              options.withCredentials = true;
              console.log('Video.js XHR request:', options.uri);
              return options;
            };
          }
        }
        
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
        console.error('Video.js player error:', error);
        onError(error);
      });
    }

    // 디버깅을 위한 추가 이벤트 리스너
    player.on('loadstart', () => console.log('Video.js: loadstart'));
    player.on('loadedmetadata', () => console.log('Video.js: loadedmetadata'));
    player.on('canplay', () => console.log('Video.js: canplay'));
    player.on('playing', () => console.log('Video.js: playing'));
    player.on('waiting', () => console.log('Video.js: waiting'));
    player.on('stalled', () => console.log('Video.js: stalled'));
    
    // HLS 관련 이벤트 리스너 (더 자세한 디버깅)
    const tech = player.tech({ IWillNotUseThisInPlugins: true }) as any;
    if (tech?.vhs) {
      tech.vhs.on('loadedplaylist', () => {
        console.log('VHS: loadedplaylist');
      });
      tech.vhs.on('error', (event: any) => {
        console.error('VHS error:', event);
      });
    }

    playerRef.current = player;

    // cleanup 함수는 실제 언마운트 시에만 실행되도록 ref 사용
    return () => {
      // 실제 언마운트인지 확인
      if (!isMountedRef.current) {
        if (playerRef.current && !playerRef.current.isDisposed()) {
          playerRef.current.dispose();
          playerRef.current = null;
        }

        // 스트리밍 세션 종료 (비동기로 실행하되 기다리지 않음)
        stopStreaming(mediaId).catch(error => {
          console.error('Failed to stop streaming:', error);
        });
      }
    };
  }, [src, mediaId, onReady, onEnded, onError]);

  // 실제 언마운트 추적
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return (
    <div data-vjs-player>
      <div ref={videoRef} />
    </div>
  );
}
