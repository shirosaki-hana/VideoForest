import { create } from 'zustand';
import {
  checkAuthStatus,
  setupPassword,
  login as apiLogin,
  logout as apiLogout,
} from '../api/auth';
import type { SetupPasswordRequest, LoginRequest } from '@videoforest/types';

interface AuthState {
  // 상태
  isSetup: boolean; // 비밀번호가 설정되었는지
  isAuthenticated: boolean; // 로그인 되었는지
  isLoading: boolean; // 로딩 중인지
  error: string | null; // 에러 메시지

  // 액션
  checkStatus: () => Promise<void>;
  setup: (data: SetupPasswordRequest) => Promise<void>;
  login: (data: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

// 에러 메시지 추출 헬퍼
const getErrorMessage = (error: any, defaultMessage: string): string => {
  if (error.response?.data?.error) {
    return error.response.data.error;
  }
  if (error.message) {
    return error.message;
  }
  return defaultMessage;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  // 초기 상태
  isSetup: false,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  // 인증 상태 확인
  checkStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const status = await checkAuthStatus();
      set({
        isSetup: status.isSetup,
        isAuthenticated: status.isAuthenticated,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: getErrorMessage(error, 'Failed to check authentication status'),
        isLoading: false,
      });
    }
  },

  // 비밀번호 설정
  setup: async (data: SetupPasswordRequest) => {
    set({ isLoading: true, error: null });
    try {
      await setupPassword(data);
      // 설정 후 상태 재확인
      await get().checkStatus();
    } catch (error: any) {
      set({
        error: getErrorMessage(error, 'Failed to set password'),
        isLoading: false,
      });
      throw error;
    }
  },

  // 로그인
  login: async (data: LoginRequest) => {
    set({ isLoading: true, error: null });
    try {
      await apiLogin(data);
      // 로그인 후 상태 재확인
      await get().checkStatus();
    } catch (error: any) {
      set({
        error: getErrorMessage(error, 'Login failed'),
        isLoading: false,
      });
      throw error;
    }
  },

  // 로그아웃
  logout: async () => {
    set({ isLoading: true, error: null });
    try {
      await apiLogout();
      set({
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: getErrorMessage(error, 'Logout failed'),
        isLoading: false,
      });
    }
  },

  // 에러 초기화
  clearError: () => set({ error: null }),
}));
