import { create } from 'zustand';
import { getMediaTree } from '../api/media';
import { collectAllFolderIds } from '../utils/mediaTree';
import type { MediaTreeNode } from '@videoforest/types';
import { snackbar } from './snackbarStore';

interface MediaState {
  // 상태
  mediaTree: MediaTreeNode[];
  loading: boolean;
  expandedFolders: Set<string>;

  // 액션
  loadMediaTree: () => Promise<void>;
  toggleFolder: (folderId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
}

export const useMediaStore = create<MediaState>((set, get) => ({
  // 초기 상태
  mediaTree: [],
  loading: false,
  expandedFolders: new Set(),

  // 미디어 트리 로드
  loadMediaTree: async () => {
    set({ loading: true });
    try {
      const response = await getMediaTree();
      set({ mediaTree: response.tree, loading: false });
    } catch {
      snackbar.error('media.errors.loadFailed', true);
      set({ loading: false });
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
}));
