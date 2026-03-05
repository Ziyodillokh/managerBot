import { Update, Start, On, Ctx, Action, Next } from 'nestjs-telegraf';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { GroupsService } from '../modules/groups/groups.service';
import { UsersService } from '../modules/users/users.service';
import { MessagesService } from '../modules/messages/messages.service';
import { MtprotoService } from './mtproto.service';
import { T, Lang, LANG_LABELS, tr } from './i18n';

// ─── State interfaces ────────────────────────────────────────────────────────

interface DeleteState {
  step: 'awaiting_date' | 'awaiting_user_date';
  groupTelegramId: number;
  groupTitle: string;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function range(from: Date, to: Date): string {
  return (
    from.toISOString().slice(0, 10) + ' — ' + to.toISOString().slice(0, 10)
  );
}

// ─────────────────────────────────────────────────────────────────────────────

@Update()
export class TelegramUpdate implements OnModuleInit {
  private readonly logger = new Logger(TelegramUpdate.name);

  /** Conversation state per user */
  private readonly deleteStates = new Map<number, DeleteState>();
  /** Language preference per user (persists in memory until restart) */
  private readonly langMap = new Map<number, Lang>();

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly groupsService: GroupsService,
    private readonly usersService: UsersService,
    private readonly messagesService: MessagesService,
    private readonly mtproto: MtprotoService,
  ) {}

  // ─────────────────────── Bot init ────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    try {
      await this.bot.telegram.setMyCommands(
        [{ command: 'start', description: '🏠 Menu / Menyu / Меню' }],
        { scope: { type: 'all_private_chats' } },
      );
      await this.bot.telegram.setMyCommands([], {
        scope: { type: 'all_group_chats' },
      });
      await this.bot.telegram.setMyCommands([]);
      this.logger.log('✅ Commands registered with Telegram');
    } catch (err) {
      this.logger.error('Failed to register commands', err);
    }
  }

  // ─────────────────────── i18n helpers ────────────────────────────────────

  private lang(userId: number): Lang {
    return this.langMap.get(userId) ?? 'uz';
  }

  private t(userId: number): (typeof T)[Lang] {
    return T[this.lang(userId)];
  }

  private mtStatus(userId: number): string {
    const t = this.t(userId);
    return this.mtproto.isReady() ? t.mtOn : t.mtOff;
  }

  private mtHint(userId: number): string {
    const t = this.t(userId);
    return this.mtproto.isReady() ? t.mtHintOn : t.mtHintOff;
  }

  private modeLabel(userId: number): string {
    const t = this.t(userId);
    return this.mtproto.isReady() ? t.mtMode : t.botApiMode;
  }

  // ─────────────────── Bot guruhga qo'shildi / chiqarildi ──────────────────

  @On('my_chat_member')
  async onMyChatMember(@Ctx() ctx: Context): Promise<void> {
    const update = (ctx.update as any).my_chat_member;
    if (!update) return;

    const chat = update.chat;
    const from = update.from;
    const newStatus = update.new_chat_member?.status;

    if (chat.type === 'private') return;

    // Bot removed
    if (['left', 'kicked'].includes(newStatus)) {
      await this.groupsService.deactivate(chat.id);
      this.logger.log(`Bot removed from: ${chat.title}`);
      return;
    }

    if (!['member', 'administrator'].includes(newStatus)) return;

    const t = this.t(from.id);

    // Only owner can add the bot
    try {
      const member = await ctx.telegram.getChatMember(chat.id, from.id);
      if (member.status !== 'creator') {
        this.logger.warn(
          `Non-owner (${from.id}) tried to add bot to "${chat.title}"`,
        );
        try {
          await ctx.telegram.sendMessage(from.id, t.notOwner(chat.title), {
            parse_mode: 'HTML',
          });
        } catch {}
        try {
          await ctx.telegram.leaveChat(chat.id);
        } catch {}
        return;
      }
    } catch (err) {
      this.logger.error('getChatMember error', err);
    }

    // Check bot admin rights
    try {
      const botInfo = await this.bot.telegram.getMe();
      const botMember = await ctx.telegram.getChatMember(chat.id, botInfo.id);
      if (botMember.status !== 'administrator') {
        try {
          await ctx.telegram.sendMessage(from.id, t.noAdminRights(chat.title), {
            parse_mode: 'HTML',
          });
        } catch {}
      }
    } catch {}

    // Persist
    await this.groupsService.findOrCreate(
      chat.id,
      chat.title,
      chat.type,
      chat.username,
    );
    await this.usersService.findOrCreate(
      from.id,
      from.first_name,
      from.last_name,
      from.username,
    );

    this.logger.log(`Bot added to group: "${chat.title}" (${chat.id})`);

    try {
      await ctx.telegram.sendMessage(from.id, t.addedToGroup(chat.title), {
        parse_mode: 'HTML',
      });
    } catch {}
  }

  // ─────────────────── Message tracking in groups ───────────────────────────

  @On('message')
  async onMessage(
    @Ctx() ctx: Context,
    @Next() next: () => Promise<void>,
  ): Promise<void> {
    try {
      const msg = ctx.message as any;
      if (!msg || !ctx.from) return next();

      const text: string = msg.text ?? '';

      // Private chat — handle delete flow input
      if (ctx.chat?.type === 'private') {
        if (!text.startsWith('/')) {
          const state = this.deleteStates.get(ctx.from.id);
          if (state) {
            await this.handleDeleteInput(ctx, text, state);
            return;
          }
        }
        return next();
      }

      // Group — skip commands
      if (text.startsWith('/')) return next();

      await this.usersService.findOrCreate(
        ctx.from.id,
        ctx.from.first_name,
        ctx.from.last_name,
        ctx.from.username,
      );

      const title = (ctx.chat as any).title ?? 'Unknown';
      await this.groupsService.findOrCreate(
        ctx.chat!.id,
        title,
        ctx.chat!.type,
        (ctx.chat as any).username,
      );

      const sentAt = new Date(msg.date * 1000);
      await this.messagesService.saveMessage(
        msg.message_id,
        ctx.chat!.id,
        ctx.from.id,
        ctx.from.first_name,
        sentAt,
        text || undefined,
        ctx.from.username,
        ctx.from.last_name,
      );
    } catch (err) {
      this.logger.error('onMessage error', err);
    }
    return next();
  }

  // ────────────────────────────── /start ───────────────────────────────────

  @Start()
  async onStart(@Ctx() ctx: Context): Promise<void> {
    try {
      if (ctx.chat?.type !== 'private') return;
      this.deleteStates.delete(ctx.from!.id);

      await this.usersService.findOrCreate(
        ctx.from!.id,
        ctx.from!.first_name,
        ctx.from!.last_name,
        ctx.from!.username,
      );

      // First-time user: show language selector
      if (!this.langMap.has(ctx.from!.id)) {
        await this.sendLangSelect(ctx, false);
        return;
      }

      await this.sendMainMenu(ctx, false);
    } catch (err) {
      this.logger.error('onStart error', err);
    }
  }

  // ─────────────────────── Language selection ───────────────────────────────

  private async sendLangSelect(ctx: Context, edit: boolean): Promise<void> {
    const text = '🌐 <b>Tilni tanlang / Выберите язык / Choose language:</b>';
    const keyboard = [
      Object.entries(LANG_LABELS).map(([code, label]) => ({
        text: label,
        callback_data: 'lang:' + code,
      })),
    ];
    const opts: any = {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    };
    if (edit) {
      try {
        await (ctx as any).editMessageText(text, opts);
      } catch {}
      try {
        await (ctx as any).answerCbQuery();
      } catch {}
    } else {
      await ctx.reply(text, opts);
    }
  }

  @Action(/^lang:(uz|ru|en)$/)
  async onLangSelect(@Ctx() ctx: Context): Promise<void> {
    const code = ((ctx as any).callbackQuery?.data as string).split(
      ':',
    )[1] as Lang;
    this.langMap.set(ctx.from!.id, code);
    const t = this.t(ctx.from!.id);
    await (ctx as any).answerCbQuery(t.langChanged, { show_alert: false });
    await this.sendMainMenu(ctx, true);
  }

  // ──────────────────────── Main menu ──────────────────────────────────────

  private async getMyGroups(
    userId: number,
  ): Promise<Array<{ telegramId: string; title: string }>> {
    const allGroups = await this.groupsService.getActiveGroups();
    const myGroups: Array<{ telegramId: string; title: string }> = [];
    for (const group of allGroups) {
      try {
        const member = await this.bot.telegram.getChatMember(
          Number(group.telegramId),
          userId,
        );
        if (member.status === 'creator') {
          myGroups.push({ telegramId: group.telegramId, title: group.title });
        }
      } catch {}
    }
    return myGroups;
  }

  private async sendMainMenu(ctx: Context, edit: boolean): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const botInfo = await this.bot.telegram.getMe();
    const addUrl = `https://t.me/${botInfo.username}?startgroup=true`;
    const myGroups = await this.getMyGroups(userId);
    const status = this.mtStatus(userId);

    let text: string;
    let keyboard: any[][];

    if (myGroups.length === 0) {
      text = t.menuNoGroups(status);
      keyboard = [
        [{ text: t.btnAddGroup, url: addUrl }],
        [
          { text: t.btnHelp, callback_data: 'help' },
          { text: t.langBtn, callback_data: 'lang:select' },
        ],
      ];
    } else {
      const list = myGroups.map((g) => '• ' + g.title).join('\n');
      text = t.menuHasGroups(status, myGroups.length, list);
      keyboard = [
        [{ text: t.btnDelete, callback_data: 'delete:start' }],
        [{ text: t.btnAddNew, url: addUrl }],
        [
          { text: t.btnHelp, callback_data: 'help' },
          { text: t.langBtn, callback_data: 'lang:select' },
        ],
      ];
    }

    const opts: any = {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    };
    if (edit) {
      try {
        await (ctx as any).editMessageText(text, opts);
      } catch {}
      try {
        await (ctx as any).answerCbQuery();
      } catch {}
    } else {
      await ctx.reply(text, opts);
    }
  }

  @Action('menu:main')
  async onMenuMain(@Ctx() ctx: Context): Promise<void> {
    if (ctx.from) this.deleteStates.delete(ctx.from.id);
    await this.sendMainMenu(ctx, true);
  }

  @Action('lang:select')
  async onLangSelectAction(@Ctx() ctx: Context): Promise<void> {
    await this.sendLangSelect(ctx, true);
  }

  // ────────────────────────── Help ─────────────────────────────────────────

  @Action('help')
  async onHelp(@Ctx() ctx: Context): Promise<void> {
    const t = this.t(ctx.from!.id);
    await (ctx as any).editMessageText(t.helpText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: t.btnBack, callback_data: 'menu:main' }]],
      },
    });
    await (ctx as any).answerCbQuery();
  }

  // ─────────────────── Delete: group selection ─────────────────────────────

  @Action('delete:start')
  async onDeleteStart(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const myGroups = await this.getMyGroups(userId);

    if (myGroups.length === 0) {
      await (ctx as any).editMessageText(t.noGroups, {
        reply_markup: {
          inline_keyboard: [[{ text: t.btnBack, callback_data: 'menu:main' }]],
        },
      });
      await (ctx as any).answerCbQuery();
      return;
    }

    if (myGroups.length === 1) {
      await this.showGroupDeleteMenu(
        ctx,
        Number(myGroups[0].telegramId),
        myGroups[0].title,
      );
      return;
    }

    const keyboard = [
      ...myGroups.map((g) => [
        { text: '📋 ' + g.title, callback_data: 'del:g:' + g.telegramId },
      ]),
      [{ text: t.btnBack, callback_data: 'menu:main' }],
    ];
    await (ctx as any).editMessageText(t.selectGroup, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    });
    await (ctx as any).answerCbQuery();
  }

  @Action(/^del:g:(.+)$/)
  async onDeleteGroupSelect(@Ctx() ctx: Context): Promise<void> {
    const cbData = (ctx as any).callbackQuery?.data as string;
    const groupTelegramId = cbData.replace('del:g:', '');
    const group = await this.groupsService.findByTelegramId(groupTelegramId);
    if (!group) {
      await (ctx as any).answerCbQuery(this.t(ctx.from!.id).groupNotFound);
      return;
    }
    await this.showGroupDeleteMenu(ctx, Number(group.telegramId), group.title);
  }

  // ─────────────────── Delete: type selection ──────────────────────────────

  private async showGroupDeleteMenu(
    ctx: Context,
    groupTelegramId: number,
    groupTitle: string,
  ): Promise<void> {
    const t = this.t(ctx.from!.id);
    await (ctx as any).editMessageText(t.deleteType(groupTitle), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: t.btnAllMsgs, callback_data: 'del:all:' + groupTelegramId }],
          [
            {
              text: t.btnUserMsgs,
              callback_data: 'del:user:' + groupTelegramId,
            },
          ],
          [{ text: t.btnBack, callback_data: 'delete:start' }],
        ],
      },
    });
    await (ctx as any).answerCbQuery();
  }

  // ──────────────────── Delete: date/user prompts ───────────────────────────

  @Action(/^del:all:(.+)$/)
  async onDeleteAllPrompt(@Ctx() ctx: Context): Promise<void> {
    const cbData = (ctx as any).callbackQuery?.data as string;
    const groupTelegramId = cbData.replace('del:all:', '');
    const group = await this.groupsService.findByTelegramId(groupTelegramId);
    const userId = ctx.from!.id;
    const t = this.t(userId);

    this.deleteStates.set(userId, {
      step: 'awaiting_date',
      groupTelegramId: Number(groupTelegramId),
      groupTitle: group?.title ?? 'Group',
    });

    await (ctx as any).editMessageText(
      t.inputAllDate(group?.title ?? 'Group', this.mtHint(userId)),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t.btnCancel, callback_data: 'del:cancel' }],
          ],
        },
      },
    );
    await (ctx as any).answerCbQuery();
  }

  @Action(/^del:user:(.+)$/)
  async onDeleteUserPrompt(@Ctx() ctx: Context): Promise<void> {
    const cbData = (ctx as any).callbackQuery?.data as string;
    const groupTelegramId = cbData.replace('del:user:', '');
    const group = await this.groupsService.findByTelegramId(groupTelegramId);
    const userId = ctx.from!.id;
    const t = this.t(userId);

    this.deleteStates.set(userId, {
      step: 'awaiting_user_date',
      groupTelegramId: Number(groupTelegramId),
      groupTitle: group?.title ?? 'Group',
    });

    await (ctx as any).editMessageText(
      t.inputUserDate(group?.title ?? 'Group', this.mtHint(userId)),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t.btnCancel, callback_data: 'del:cancel' }],
          ],
        },
      },
    );
    await (ctx as any).answerCbQuery();
  }

  @Action('del:cancel')
  async onDeleteCancel(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    this.deleteStates.delete(userId);
    const t = this.t(userId);
    await (ctx as any).editMessageText(t.cancelled);
    try {
      await (ctx as any).answerCbQuery();
    } catch {}
    setTimeout(async () => {
      try {
        await this.sendMainMenu(ctx, true);
      } catch {}
    }, 1200);
  }

  // ─────────────────── Text input handler ──────────────────────────────────

  private async handleDeleteInput(
    ctx: Context,
    text: string,
    state: DeleteState,
  ): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);

    if (state.step === 'awaiting_date') {
      const match = text
        .trim()
        .match(/^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})$/);
      if (!match) {
        await ctx.reply(t.badFormat + t.badDateFormat, { parse_mode: 'HTML' });
        return;
      }
      const from = new Date(match[1] + 'T00:00:00.000Z');
      const to = new Date(match[2] + 'T23:59:59.999Z');
      if (from > to) {
        await ctx.reply(t.dateOrderError);
        return;
      }
      this.deleteStates.delete(userId);
      await this.executeDelete(
        ctx,
        state.groupTelegramId,
        state.groupTitle,
        from,
        to,
        null,
      );
      return;
    }

    if (state.step === 'awaiting_user_date') {
      const match = text
        .trim()
        .match(/^(@?\w+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})$/);
      if (!match) {
        await ctx.reply(t.badFormat + t.badUserDateFormat, {
          parse_mode: 'HTML',
        });
        return;
      }
      const from = new Date(match[2] + 'T00:00:00.000Z');
      const to = new Date(match[3] + 'T23:59:59.999Z');
      if (from > to) {
        await ctx.reply(t.dateOrderError);
        return;
      }
      this.deleteStates.delete(userId);
      await this.executeDelete(
        ctx,
        state.groupTelegramId,
        state.groupTitle,
        from,
        to,
        match[1],
      );
    }
  }

  // ────────────────────── Delete execution engine ──────────────────────────

  private async executeDelete(
    ctx: Context,
    groupTelegramId: number,
    groupTitle: string,
    fromDate: Date,
    toDate: Date,
    username: string | null,
  ): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const chatId = ctx.chat!.id;

    const progressMsg = await ctx.reply(t.searching(groupTitle), {
      parse_mode: 'HTML',
    });
    const progressId = (progressMsg as any).message_id;

    const edit = async (text: string, opts?: any) => {
      try {
        await this.bot.telegram.editMessageText(
          chatId,
          progressId,
          undefined,
          text,
          { parse_mode: 'HTML', ...opts },
        );
      } catch {}
    };

    try {
      // ── Get group owner to protect their messages ────────────────────────
      let ownerTelegramId: string | null = null;
      let ownerNumericId: number | null = null;
      try {
        const admins =
          await this.bot.telegram.getChatAdministrators(groupTelegramId);
        const owner = admins.find((a) => a.status === 'creator');
        if (owner) {
          ownerTelegramId = String(owner.user.id);
          ownerNumericId = owner.user.id;
        }
      } catch {}

      // ── Resolve target user (for single-user delete) ──────────────────
      let targetTelegramId: string | undefined;
      let targetNumericId: number | undefined;
      if (username) {
        const uname = username.startsWith('@') ? username.slice(1) : username;
        const user = await this.usersService.findByUsername(uname);
        if (!user) {
          await edit(t.userNotFound(uname));
          return;
        }
        targetTelegramId = user.telegramId;
        targetNumericId = Number(user.telegramId);
        if (ownerTelegramId && targetTelegramId === ownerTelegramId) {
          await edit(t.ownerProtected);
          return;
        }
      }

      const excludeIds: number[] = ownerNumericId ? [ownerNumericId] : [];
      const r = range(fromDate, toDate);

      // ════════════════════════════════════════════════════════════════════
      //  STRATEGY A: MTProto (USER session) — reads Telegram history directly
      //  This works for ALL messages regardless of age.
      // ════════════════════════════════════════════════════════════════════
      if (this.mtproto.isReady()) {
        const result = await this.mtproto.fetchAndDeleteByDateRange(
          groupTelegramId,
          fromDate,
          toDate,
          targetNumericId,
          excludeIds,
          async (found, done) => {
            await edit(t.deleting(found) + `\n⬛ ${done}/${found}`);
          },
        );

        if (result.notMember) {
          // Session user is not a member of this group →
          // show warning and fall through to Strategy B (DB fallback)
          await edit(t.notMemberWarning);
          await new Promise((r) => setTimeout(r, 1500));
          // intentionally no `return` — falls through to Strategy B below
        } else if (result.total === 0) {
          await edit(username ? t.notFoundUser(username, r) : t.notFound(r));
          return;
        } else {
          // MTProto success — clean DB records too
          try {
            const dbMessages =
              await this.messagesService.getMessagesByDateRange(
                groupTelegramId,
                fromDate,
                toDate,
                targetTelegramId,
              );
            const dbIds = dbMessages
              .filter(
                (m) =>
                  !(
                    ownerTelegramId &&
                    String(m.telegramUserId) === ownerTelegramId
                  ),
              )
              .map((m) => m.id);
            if (dbIds.length)
              await this.messagesService.deleteMessagesFromDb(dbIds);
          } catch {}

          const mode = this.modeLabel(userId);
          const summary = username
            ? t.resultUser(groupTitle, username, result.deleted, r, mode)
            : t.resultAll(groupTitle, result.deleted, r, mode);

          await edit(
            summary + (result.failed > 0 ? t.failedSome(result.failed) : ''),
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: t.btnRepeat, callback_data: 'delete:start' },
                    { text: t.btnMain, callback_data: 'menu:main' },
                  ],
                ],
              },
            },
          );
          return;
        }
      }

      // ════════════════════════════════════════════════════════════════════
      //  STRATEGY B: Bot API fallback — uses OUR DB (48h limit applies)
      //  Only messages tracked while the bot was active will be deleted.
      // ════════════════════════════════════════════════════════════════════
      const messages = await this.messagesService.getMessagesByDateRange(
        groupTelegramId,
        fromDate,
        toDate,
        targetTelegramId,
      );

      const toDelete = messages.filter(
        (m) =>
          !(ownerTelegramId && String(m.telegramUserId) === ownerTelegramId),
      );

      if (toDelete.length === 0) {
        await edit(username ? t.notFoundUser(username, r) : t.notFound(r));
        return;
      }

      await edit(t.deleting(toDelete.length));

      const messageIds = toDelete.map((m) => Number(m.telegramMessageId));
      const dbIdMap: Record<number, number> = {};
      for (const m of toDelete) dbIdMap[Number(m.telegramMessageId)] = m.id;

      let deleted = 0;
      let failed = 0;

      const BATCH = 100;
      for (let i = 0; i < messageIds.length; i += BATCH) {
        const batch = messageIds.slice(i, i + BATCH);
        try {
          await (this.bot.telegram as any).deleteMessages(
            groupTelegramId,
            batch,
          );
          deleted += batch.length;
        } catch {
          for (const id of batch) {
            try {
              await this.bot.telegram.deleteMessage(groupTelegramId, id);
              deleted++;
            } catch {
              failed++;
            }
          }
        }
        if (i > 0 && i % 500 === 0) {
          await edit(
            t.deleting(toDelete.length) + `\n⬛ ${i}/${toDelete.length}`,
          );
        }
        if (i + BATCH < messageIds.length)
          await new Promise((res) => setTimeout(res, 350));
      }

      // Clean DB
      const dbIds = messageIds.map((id) => dbIdMap[id]).filter(Boolean);
      if (dbIds.length) await this.messagesService.deleteMessagesFromDb(dbIds);

      const mode = this.modeLabel(userId);
      const summary = username
        ? t.resultUser(groupTitle, username, deleted, r, mode)
        : t.resultAll(groupTitle, deleted, r, mode);

      await edit(summary + (failed > 0 ? t.failedSome(failed) : ''), {
        reply_markup: {
          inline_keyboard: [
            [
              { text: t.btnRepeat, callback_data: 'delete:start' },
              { text: t.btnMain, callback_data: 'menu:main' },
            ],
          ],
        },
      });
    } catch (err) {
      this.logger.error('executeDelete error', err);
      try {
        await ctx.reply(t.error);
      } catch {}
    }
  }
}
