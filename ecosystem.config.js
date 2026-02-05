export const apps = [
  {
    name: 'video-forest',
    script: 'backend/dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
  },
];
