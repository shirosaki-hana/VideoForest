import { useEffect, useRef } from 'react';
import { MediaPlayer, MediaProvider, type MediaPlayerInstance, type MediaErrorDetail, isHLSProvider } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import HLS from 'hls.js';
import { useSettingsStore, type QualityPreference } from '../stores/settingsStore';

export type PlayerError = MediaErrorDetail | null;

/**
 * 사용자 화질 선호도를 HLS 레벨 인덱스로 변환
 *
 * HLS.js는 레벨을 비트레이트 **오름차순**으로 정렬함:
 * - 인덱스 0: 가장 낮은 화질 (예: 360p)
 * - 인덱스 N-1: 가장 높은 화질 (예: 1080p)
 *
 * @param preference 사용자 화질 선호도 (high/medium/low)
 * @param levelCount 마스터 플레이리스트의 총 레벨 수
 * @returns HLS 레벨 인덱스
 */
function getQualityLevelIndex(preference: QualityPreference, levelCount: number): number {
  if (levelCount <= 0) return 0;
  if (levelCount === 1) return 0;

  switch (preference) {
    case 'high':
      return levelCount - 1; // 마지막 = 가장 높은 화질
    case 'medium':
      return Math.floor(levelCount / 2); // 중간
    case 'low':
      return 0; // 첫 번째 = 가장 낮은 화질
  }
}

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
  const hlsRef = useRef<HLS | null>(null);
  const preferredQuality = useSettingsStore(state => state.preferredQuality);

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
            // ABR 비활성화 - JIT 트랜스코딩 환경에서 급격한 화질 전환 방지
            // startLevel은 MANIFEST_LOADED 이벤트에서 설정
            startLevel: -1, // -1 = 자동 선택 (초기값, MANIFEST_LOADED에서 변경됨)
            autoStartLoad: true,
          };

          // HLS 인스턴스 이벤트 핸들링을 위한 설정
          provider.onInstance((hls) => {
            hlsRef.current = hls;

            // 마스터 플레이리스트 파싱 완료 시 화질 고정
            // MANIFEST_PARSED: levels 배열이 완전히 준비된 시점
            hls.on(HLS.Events.MANIFEST_PARSED, () => {
              const levelCount = hls.levels.length;
              const targetLevel = getQualityLevelIndex(preferredQuality, levelCount);

              // 선택된 화질로 고정 (ABR 비활성화)
              // currentLevel을 설정하면 autoLevelEnabled가 자동으로 false가 됨
              hls.currentLevel = targetLevel;

              // 레벨 변경 로그 (디버그용)
              const level = hls.levels[targetLevel];
              const levelName = level?.name || `${level?.height}p`;
              console.log(`[VideoPlayer] Quality fixed to: ${levelName} (level ${targetLevel}/${levelCount}, ${level?.bitrate} bps)`);
              console.log(`[VideoPlayer] All levels:`, hls.levels.map((l, i) => `${i}: ${l.name || l.height + 'p'}`).join(', '));
            });

            // 디버그: 레벨 변경 감지
            hls.on(HLS.Events.LEVEL_SWITCHED, (_event, data) => {
              const level = hls.levels[data.level];
              console.log(`[VideoPlayer] Level switched to: ${level?.name || level?.height + 'p'}`);
            });
          });
        }
      }}
      style={{ width: '100%', height: '100%' }}
      className="jit-player"
    >
      <MediaProvider />
      <DefaultVideoLayout icons={defaultLayoutIcons} />
      {/*
        Auto 품질 옵션 숨김 (CSS)
        
        JIT 트랜스코딩 환경에서는:
        - ABR을 비활성화하고 고정 화질로 재생
        - 화질은 애플리케이션 설정에서만 제어
        - Auto 옵션은 혼동을 주므로 숨김
        
        Note: Vidstack은 특정 품질 옵션만 숨기는 공식 API를 제공하지 않음
        aria-label은 접근성 속성이므로 비교적 안정적임
      */}
      <style>{`
        .jit-player .vds-menu-checkbox[aria-label="Auto"],
        .jit-player .vds-menu-item-label:has(+ .vds-menu-checkbox[aria-label="Auto"]),
        .jit-player .vds-radio[aria-label="Auto"] {
          display: none !important;
        }
        /* 부모 menu-item도 숨김 (구조에 따라) */
        .jit-player .vds-menu-item:has(.vds-menu-checkbox[aria-label="Auto"]) {
          display: none !important;
        }
      `}</style>
    </MediaPlayer>
  );
}
