export default {
  translation: {
    // Common
    common: {
      appName: 'VideoForest',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      cancel: 'Cancel',
      save: 'Save',
      close: 'Close',
    },

    // Auth
    auth: {
      setup: {
        title: 'Setup Password',
        subtitle: 'Set an administrator password to get started',
        password: 'Password',
        confirmPassword: 'Confirm Password',
        passwordHelper: 'At least 8 characters, including letters and numbers',
        submit: 'Set Password',
        submitting: 'Setting...',
        passwordMismatch: 'Passwords do not match',
        invalidFormat: 'Invalid password format',
      },
      login: {
        title: 'Sign In',
        subtitle: 'Sign in to continue',
        password: 'Password',
        submit: 'Sign In',
        submitting: 'Signing in...',
      },
      logout: 'Sign Out',
    },

    // Media
    media: {
      title: 'Media Library',
      empty: 'No media files',
      emptyHint: 'Click the Scan button to scan media directories',
      refresh: 'Refresh',
      scan: 'Scan',
      count: 'Total {{count}} media files',

      // Tree controls
      expandAll: 'Expand All',
      collapseAll: 'Collapse All',

      // File/Folder types
      folder: 'Folder',
      file: 'File',
      files: '{{count}} files',
      folders: '{{count}} folders',

      // File information
      resolution: 'Resolution',
      codec: 'Codec',
      duration: 'Duration',
      fileSize: 'File Size',
      bitrate: 'Bitrate',
      fps: 'FPS',
      audioCodec: 'Audio Codec',

      // Scan dialog
      scanDialog: {
        title: 'Media Scan',
        starting: 'Starting scan...',
        scanning: 'Scanning...',
        progress: '{{current}} / {{total}}',
        currentFile: 'Current File',
        complete: 'Scan Complete!',
        success: 'Success: {{count}}',
        failed: 'Failed: {{count}}',
        total: 'Total: {{count}}',
        close: 'Close',
        error: 'An error occurred during scan',
      },
    },

    // Settings
    settings: {
      title: 'Settings',
      theme: {
        title: 'Theme',
        light: 'Light',
        dark: 'Dark',
        system: 'System',
      },
      language: {
        title: 'Language',
        ko: '한국어',
        en: 'English',
      },
      playback: {
        title: 'Playback Settings',
        autoPlayNext: 'Auto-play Next',
        autoPlayNextDesc: 'Automatically play the next file in the same folder when the video ends',
      },
    },

    // Errors
    errors: {
      statusCheckFailed: 'Failed to check status',
      setupFailed: 'Failed to set password',
      loginFailed: 'Failed to sign in',
      logoutFailed: 'Failed to sign out',
      network: 'Network error',
      unknown: 'Unknown error occurred',
    },
  },
};
