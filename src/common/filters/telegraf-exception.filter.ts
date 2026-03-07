import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { TelegrafArgumentsHost } from 'nestjs-telegraf';
import { Context } from 'telegraf';

@Catch()
export class TelegrafExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(TelegrafExceptionFilter.name);

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const telegrafHost = TelegrafArgumentsHost.create(host);
    const ctx = telegrafHost.getContext<Context>();

    this.logger.error('Telegraf exception:', exception);

    try {
      await ctx.reply('⚠️ Error / Xatolik / Ошибка');
    } catch {
      // reply failed — nothing else we can do
    }
  }
}
