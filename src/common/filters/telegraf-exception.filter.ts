import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { TelegrafArgumentsHost } from 'nestjs-telegraf';
import { Context } from 'telegraf';

@Catch()
export class TelegrafExceptionFilter extends BaseExceptionFilter {
  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const telegrafHost = TelegrafArgumentsHost.create(host);
    const ctx = telegrafHost.getContext<Context>();

    console.error('Telegraf exception:', exception);

    try {
      await ctx.reply("⚠️ Xatolik yuz berdi. Qaytadan urinib ko'ring.");
    } catch (_) {
      // noop
    }
  }
}
