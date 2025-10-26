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

    // Media
    media: {
      title: '미디어 라이브러리',
      empty: '미디어 파일이 없습니다',
      emptyHint: '스캔 버튼을 눌러 미디어 디렉터리를 스캔하세요',
      refresh: '새로고침',
      scan: '스캔',
      count: '총 {{count}}개의 미디어 파일',

      // 트리 컨트롤
      expandAll: '전체 펼치기',
      collapseAll: '전체 접기',

      // 파일/폴더 타입
      folder: '폴더',
      file: '파일',
      files: '{{count}}개 파일',
      folders: '{{count}}개 폴더',

      // 파일 정보
      resolution: '해상도',
      codec: '코덱',
      duration: '길이',
      fileSize: '파일 크기',
      bitrate: '비트레이트',
      fps: 'FPS',
      audioCodec: '오디오 코덱',

      // 스캔 다이얼로그
      scanDialog: {
        title: '미디어 스캔',
        starting: '스캔 시작 중...',
        scanning: '스캔 중...',
        progress: '{{current}} / {{total}}',
        currentFile: '현재 파일',
        complete: '스캔 완료!',
        success: '성공: {{count}}개',
        failed: '실패: {{count}}개',
        total: '전체: {{count}}개',
        close: '닫기',
        error: '스캔 중 오류가 발생했습니다',
      },
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
      playback: {
        title: '재생 설정',
        autoPlayNext: '자동 연속 재생',
        autoPlayNextDesc: '비디오가 끝나면 같은 폴더의 다음 파일을 자동으로 재생합니다',
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
