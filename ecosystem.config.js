module.exports = {
  apps: [{
    name: 'mai-push-worker',
    script: './main.js',
    cwd: '/var/www/html/mai-push',
    max_memory_restart: '2G',
    env: {
      NODE_ENV: 'production',

      TWITCH_CLIENT_ID: '5d9laffnevoisb4eczur6918w61yjc',
      TWITCH_CLIENT_SECRET: '1cpgq5b880mx2o4wqx29ejmpgn6kqn',
      TWITCH_APP_ACCESS_TOKEN: 'vgzvu9zvlfi7rhtiu1q6n38w1xr2gr',
      TWITCH_BROADCASTER_LOGIN: 'koinoya_mai',
    }
  },
  {
    name: 'discord-bot',
    script: './discord-bot.js',
    cwd: '/var/www/html/mai-push',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
