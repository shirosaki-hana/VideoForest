import { create } from 'zustand';
import { getMediaTree } from '../api/media';
import { collectAllFolderIds } from '../utils/mediaTree';
import type { MediaTreeNode } from '@videoforest/types';

interface MediaState {
  // 상태
  mediaTree: MediaTreeNode[];
  loading: boolean;
  error: string | null;
  expandedFolders: Set<string>;

  // 액션
  loadMediaTree: () => Promise<void>;
  toggleFolder: (folderId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  clearError: () => void;
}

export const useMediaStore = create<MediaState>((set, get) => ({
  // 초기 상태
  mediaTree: [],
  loading: false,
  error: null,
  expandedFolders: new Set(),

  // 미디어 트리 로드
  loadMediaTree: async () => {
    set({ loading: true, error: null });
    try {
      const response = await getMediaTree();
      set({ mediaTree: response.tree, loading: false });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load media tree';
      set({
        error: errorMessage,
        loading: false,
      });
    }
  },

  // 폴더 토글
  toggleFolder: (folderId: string) => {
    set(state => {
      const next = new Set(state.expandedFolders);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return { expandedFolders: next };
    });
  },

  // 전체 펼치기
  expandAll: () => {
    const { mediaTree } = get();
    const allFolderIds = collectAllFolderIds(mediaTree);
    set({ expandedFolders: allFolderIds });
  },

  // 전체 접기
  collapseAll: () => {
    set({ expandedFolders: new Set() });
  },

  // 에러 초기화
  clearError: () => set({ error: null }),
}));
