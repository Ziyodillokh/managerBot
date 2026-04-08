export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    apiId: process.env.TELEGRAM_API_ID || '',
    apiHash: process.env.TELEGRAM_API_HASH || '',
    session: process.env.TELEGRAM_SESSION || '',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'manager_bot',
    ssl:
      process.env.DB_SSL === 'true' || process.env.DB_SSL === '1'
        ? { rejectUnauthorized: false }
        : false,
  },
});
