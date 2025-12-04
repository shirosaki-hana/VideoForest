import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 화질 선호도 설정
 *
 * JIT 트랜스코딩 환경에서 ABR의 급격한 화질 전환은
 * 불필요한 트랜스코딩과 서버 부하를 유발합니다.
 *
 * 따라서 ABR을 비활성화하고, 사용자가 선택한 화질로
 * 일관되게 재생합니다.
 *
 * - high: 마스터 플레이리스트의 첫 번째 (가장 높은) 화질
 * - medium: 중간 화질
 * - low: 마지막 (가장 낮은) 화질
 */
export type QualityPreference = 'high' | 'medium' | 'low';

interface SettingsState {
  isOpen: boolean;
  autoPlayNext: boolean; // 자동 연속 재생 설정
  preferredQuality: QualityPreference; // 선호 화질 설정
  openSettings: () => void;
  closeSettings: () => void;
  setAutoPlayNext: (enabled: boolean) => void;
  setPreferredQuality: (quality: QualityPreference) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      isOpen: false,
      autoPlayNext: true, // 기본값: 활성화
      preferredQuality: 'medium', // 기본값: 중간 화질
      openSettings: () => set({ isOpen: true }),
      closeSettings: () => set({ isOpen: false }),
      setAutoPlayNext: (enabled: boolean) => set({ autoPlayNext: enabled }),
      setPreferredQuality: (quality: QualityPreference) => set({ preferredQuality: quality }),
    }),
    {
      name: 'videoforest-settings',
      partialize: state => ({
        autoPlayNext: state.autoPlayNext,
        preferredQuality: state.preferredQuality,
      }), // isOpen은 저장하지 않음
    }
  )
);
