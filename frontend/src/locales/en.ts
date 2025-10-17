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

    // Welcome
    welcome: {
      title: 'Welcome!',
      subtitle: 'Successfully signed in to VideoForest',
      features: {
        personal: '🎬 Personal media server running on NAS',
        secure: '🔒 Securely protected content',
        accessible: '✨ Accessible anytime, anywhere',
        personal_desc: 'Organize and stream your own library without third-party cloud services.',
        secure_desc: 'Your library stays in your network with password-protected access.',
        accessible_desc: 'Watch from desktop and mobile, at home or remotely.',
      },
      get_started: 'Get started',
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

