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
      refresh: 'Refresh',
      saving: 'Saving...',
      rowsPerPage: 'Rows per page',
    },

    // Dialog
    dialog: {
      notice: 'Notice',
      confirm: 'Confirm',
      confirmButton: 'OK',
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

      // Watch status
      watched: 'Watched',

      // Error messages
      errors: {
        loadFailed: 'Failed to load media list',
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
      quality: {
        title: 'Video Quality',
        description: 'Fixed quality playback for stable streaming in JIT transcoding environment',
        high: 'High',
        medium: 'Medium',
        low: 'Low',
      },
    },

    // Player
    player: {
      loadingMedia: 'Loading media information...',
      preparingStream: 'Preparing stream...',
      preparingStreamDesc: 'Transcoding in progress. Please wait a moment.',
      playlist: 'Playlist ({{count}} items)',
      mediaInfo: 'Media Information',
      resolution: 'Resolution',
      playTime: 'Duration',
      fileSize: 'File Size',
      video: 'Video',
      audio: 'Audio',
      bitrate: 'Bitrate',
      errors: {
        missingId: 'Media ID is missing',
        loadFailed: 'Failed to load media information',
        streamTimeout: 'Stream preparation timed out. Please try again.',
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

    // Logs
    logs: {
      title: 'System Logs',
      subtitle: 'Server activity and event records',
      empty: 'No logs',
      search: 'Search messages...',
      level: 'Level',
      category: 'Category',
      all: 'All',
      time: 'Time',
      message: 'Message',
      detail: 'Log Detail',
      metadata: 'Metadata',
      settings: 'Log Settings',
      retentionDays: 'Retention Days',
      retentionDaysHelp: 'Logs older than specified days will be deleted during cleanup',
      maxLogs: 'Maximum Logs',
      maxLogsHelp: 'Oldest logs will be deleted when exceeding the limit',
      cleanup: 'Cleanup Logs',
      deleteAll: 'Delete All',
      stats: {
        total: 'Total Logs',
        errors: 'Errors',
        warnings: 'Warnings',
        last24h: '24 Hours',
      },
      categories: {
        api: 'API',
        streaming: 'Streaming',
        media: 'Media',
        auth: 'Auth',
        system: 'System',
        database: 'DB',
        server: 'Server',
      },
      errors: {
        loadFailed: 'Failed to load logs',
        settingsSaveFailed: 'Failed to save settings',
        cleanupFailed: 'Failed to cleanup logs',
        deleteFailed: 'Failed to delete logs',
      },
      confirm: {
        cleanup: 'This will cleanup old logs according to settings. Continue?',
        deleteAll: 'This will delete all logs. This action cannot be undone. Continue?',
      },
      cleanupResult: '{{count}} logs have been cleaned up.',
    },
  },
};
