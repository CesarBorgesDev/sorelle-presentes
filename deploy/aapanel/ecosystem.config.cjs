/** PM2 — rode na pasta deploy/aapanel ou passe --cwd /home/deploy/sorelle-presentes */
module.exports = {
  apps: [
    {
      name: 'sorelle-api',
      cwd: './server',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
