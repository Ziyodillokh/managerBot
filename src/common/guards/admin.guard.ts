import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_ONLY_KEY } from '../decorators/admin-only.decorator';
import { AdminsService } from '../../modules/admins/admins.service';
import { TelegrafExecutionContext } from 'nestjs-telegraf';
import { Context } from 'telegraf';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly adminsService: AdminsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAdminOnly = this.reflector.getAllAndOverride<boolean>(
      ADMIN_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!isAdminOnly) return true;

    const ctx = TelegrafExecutionContext.create(context);
    const telegrafCtx = ctx.getContext<Context>();
    const chat = telegrafCtx.chat;
    const from = telegrafCtx.from;

    if (!chat || !from) return false;

    // Allow only in groups/supergroups
    if (chat.type === 'private') {
      await telegrafCtx.reply(
        "⚠️ Bu komanda faqat guruhlar uchun mo'ljallangan.",
      );
      return false;
    }

    const isAdmin = await this.adminsService.hasAccess(
      String(chat.id),
      String(from.id),
    );
    if (!isAdmin) {
      await telegrafCtx.reply(
        '🚫 Bu amalni faqat guruh administratorlari va moderatorlari bajarishi mumkin.',
      );
      return false;
    }

    return true;
  }
}
