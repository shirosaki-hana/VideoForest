import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  isOpen: boolean;
  autoPlayNext: boolean; // 자동 연속 재생 설정
  openSettings: () => void;
  closeSettings: () => void;
  setAutoPlayNext: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      isOpen: false,
      autoPlayNext: true, // 기본값: 활성화
      openSettings: () => set({ isOpen: true }),
      closeSettings: () => set({ isOpen: false }),
      setAutoPlayNext: (enabled: boolean) => set({ autoPlayNext: enabled }),
    }),
    {
      name: 'videoforest-settings',
      partialize: state => ({ autoPlayNext: state.autoPlayNext }), // isOpen은 저장하지 않음
    }
  )
);
