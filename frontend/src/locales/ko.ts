export default {
  translation: {
    // Common
    common: {
      appName: 'VideoForest',
      loading: '로딩 중...',
      error: '오류',
      success: '성공',
      cancel: '취소',
      save: '저장',
      close: '닫기',
    },

    // Auth
    auth: {
      setup: {
        title: '비밀번호 설정',
        subtitle: '시작하려면 관리자 비밀번호를 설정하세요',
        password: '비밀번호',
        confirmPassword: '비밀번호 확인',
        passwordHelper: '8자 이상, 영문과 숫자 포함',
        submit: '비밀번호 설정',
        submitting: '설정 중...',
        passwordMismatch: '비밀번호가 일치하지 않습니다',
        invalidFormat: '비밀번호 형식이 올바르지 않습니다',
      },
      login: {
        title: '로그인',
        subtitle: '로그인하여 계속하세요',
        password: '비밀번호',
        submit: '로그인',
        submitting: '로그인 중...',
      },
      logout: '로그아웃',
    },

    // Welcome
    welcome: {
      title: '환영합니다!',
      subtitle: 'VideoForest에 성공적으로 로그인했습니다',
      features: {
        personal: '🎬 NAS에서 실행되는 개인 미디어 서버',
        secure: '🔒 안전하게 보호된 콘텐츠',
        accessible: '✨ 언제 어디서나 접근 가능',
        personal_desc: '타사 클라우드 없이 나만의 라이브러리를 구성하고 스트리밍하세요.',
        secure_desc: '비밀번호로 보호되어 라이브러리는 네트워크 안에 안전하게 보관됩니다.',
        accessible_desc: '데스크톱과 모바일에서, 집 안팎 어디서든 감상하세요.',
      },
      get_started: '시작하기',
    },

    // Settings
    settings: {
      title: '설정',
      theme: {
        title: '테마',
        light: '라이트',
        dark: '다크',
        system: '시스템',
      },
      language: {
        title: '언어',
        ko: '한국어',
        en: 'English',
      },
    },

    // Errors
    errors: {
      statusCheckFailed: '상태 확인에 실패했습니다',
      setupFailed: '비밀번호 설정에 실패했습니다',
      loginFailed: '로그인에 실패했습니다',
      logoutFailed: '로그아웃에 실패했습니다',
      network: '네트워크 오류',
      unknown: '알 수 없는 오류가 발생했습니다',
    },
  },
};

