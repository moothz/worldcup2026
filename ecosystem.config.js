module.exports = {
  apps: [
    {
      name: 'worldcup2026',
      script: 'index.js',
      cwd: '/home/moothz/worldcup2026',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'wc-sync',
      script: 'sync-live-data.js',
      cwd: '/home/moothz/worldcup2026',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      min_uptime: '10s',
    }
  ]
};