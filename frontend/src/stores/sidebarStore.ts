import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  // 사이드바 열림/닫힘 상태
  isOpen: boolean;
  // 데스크탑에서 사이드바가 접혀있는지 여부 (mini 모드)
  isMini: boolean;
  // 자동 연속 재생 설정
  autoPlayNext: boolean;

  // Actions
  toggleSidebar: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleMini: () => void;
  setAutoPlayNext: (enabled: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    set => ({
      isOpen: false, // 모바일에서 드로어가 기본적으로 닫혀있음
      isMini: false, // 데스크탑에서 사이드바가 기본적으로 펼쳐져있음
      autoPlayNext: true, // 기본값: 활성화

      toggleSidebar: () => set(state => ({ isOpen: !state.isOpen })),
      openSidebar: () => set({ isOpen: true }),
      closeSidebar: () => set({ isOpen: false }),
      toggleMini: () => set(state => ({ isMini: !state.isMini })),
      setAutoPlayNext: (enabled: boolean) => set({ autoPlayNext: enabled }),
    }),
    {
      name: 'videoforest-sidebar',
      partialize: state => ({
        isMini: state.isMini,
        autoPlayNext: state.autoPlayNext,
      }), // isOpen은 저장하지 않음
    }
  )
);
