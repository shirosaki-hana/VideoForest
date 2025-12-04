import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';

interface WatchHistoryState {
  // 시청한 미디어 ID Set
  watchedMediaIds: Set<string>;

  // 액션
  markAsWatched: (mediaId: string) => void;
  markAsUnwatched: (mediaId: string) => void;
  isWatched: (mediaId: string) => boolean;
  clearHistory: () => void;
}

// partialize로 저장될 상태 타입
type PersistedState = Pick<WatchHistoryState, 'watchedMediaIds'>;

// localStorage에 저장되는 실제 형태 (Set → 배열)
interface SerializedState {
  watchedMediaIds: string[];
}

// Set을 배열로 직렬화/역직렬화하기 위한 커스텀 스토리지
const storage: PersistStorage<PersistedState> = {
  getItem: (name: string): StorageValue<PersistedState> | null => {
    const str = localStorage.getItem(name);
    if (!str) return null;

    try {
      const data = JSON.parse(str) as StorageValue<SerializedState>;
      // 배열을 Set으로 변환
      return {
        ...data,
        state: {
          watchedMediaIds: new Set(data.state.watchedMediaIds || []),
        },
      };
    } catch {
      return null;
    }
  },

  setItem: (name: string, value: StorageValue<PersistedState>): void => {
    // Set을 배열로 변환하여 저장
    const data: StorageValue<SerializedState> = {
      ...value,
      state: {
        watchedMediaIds: [...value.state.watchedMediaIds],
      },
    };
    localStorage.setItem(name, JSON.stringify(data));
  },

  removeItem: (name: string): void => {
    localStorage.removeItem(name);
  },
};

export const useWatchHistoryStore = create<WatchHistoryState>()(
  persist(
    (set, get) => ({
      watchedMediaIds: new Set(),

      markAsWatched: (mediaId: string) => {
        set(state => {
          const next = new Set(state.watchedMediaIds);
          next.add(mediaId);
          return { watchedMediaIds: next };
        });
      },

      markAsUnwatched: (mediaId: string) => {
        set(state => {
          const next = new Set(state.watchedMediaIds);
          next.delete(mediaId);
          return { watchedMediaIds: next };
        });
      },

      isWatched: (mediaId: string) => {
        return get().watchedMediaIds.has(mediaId);
      },

      clearHistory: () => {
        set({ watchedMediaIds: new Set() });
      },
    }),
    {
      name: 'videoforest-watch-history',
      storage,
      // 액션 함수들은 저장하지 않고 watchedMediaIds만 저장
      partialize: state => ({
        watchedMediaIds: state.watchedMediaIds,
      }),
    }
  )
);
