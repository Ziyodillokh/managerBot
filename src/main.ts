import './load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

function logStartupDiagnostics(logger: Logger) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  logger.log(
    `TELEGRAM_BOT_TOKEN: ${token && token.length > 10 ? `set (length ${token.length})` : 'MISSING — bot will not work'}`,
  );
  logger.log(
    `Database: ${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5432'} / ${process.env.DB_NAME ?? 'manager_bot'} user=${process.env.DB_USERNAME ?? 'postgres'}`,
  );
  logger.log(`NODE_ENV=${process.env.NODE_ENV ?? 'undefined'} PORT=${process.env.PORT ?? '3000'}`);
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  logStartupDiagnostics(logger);

  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    logger.error(
      'Set TELEGRAM_BOT_TOKEN in /var/www/guardy/.env (no spaces around =). Then: pm2 restart guardy',
    );
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`HTTP listening on ${port} (Telegram bot uses long polling)`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
