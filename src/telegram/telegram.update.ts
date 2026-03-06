import { Update, Start, On, Ctx, Action, Next } from 'nestjs-telegraf';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { GroupsService } from '../modules/groups/groups.service';
import { UsersService } from '../modules/users/users.service';
import { MessagesService } from '../modules/messages/messages.service';
import { AdminsService } from '../modules/admins/admins.service';
import { MtprotoService } from './mtproto.service';
import { T, Lang, LANG_LABELS, MONTH_NAMES, DAY_HEADERS } from './i18n';

// ─── State interfaces ────────────────────────────────────────────────────────

interface DeleteState {
  step:
    | 'select_start_date'
    | 'select_end_date'
    | 'awaiting_username'
    | 'awaiting_add_username'
    | 'awaiting_access_username';
  groupTelegramId: number;
  groupTitle: string;
  // Calendar state
  calendarYear?: number;
  calendarMonth?: number; // 0-11
  startDate?: Date;
  // For user-specific delete
  targetUsername?: string;
  // For access management — which group
  accessGroupTelegramId?: string;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function range(from: Date, to: Date): string {
  return (
    from.toISOString().slice(0, 10) + ' — ' + to.toISOString().slice(0, 10)
  );
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function dateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// ─────────────────────────────────────────────────────────────────────────────

@Update()
export class TelegramUpdate implements OnModuleInit {
  private readonly logger = new Logger(TelegramUpdate.name);

  /** Conversation state per user */
  private readonly deleteStates = new Map<number, DeleteState>();
  /** Language preference per user (in-memory cache; source of truth is DB) */
  private readonly langMap = new Map<number, Lang>();
  /** Owner-group membership cache: userId → { groups, cachedAt } */
  private readonly groupsCache = new Map<
    number,
    { groups: Array<{ telegramId: string; title: string }>; cachedAt: number }
  >();
  private readonly GROUPS_CACHE_TTL = 60_000; // 60 seconds

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly groupsService: GroupsService,
    private readonly usersService: UsersService,
    private readonly messagesService: MessagesService,
    private readonly adminsService: AdminsService,
    private readonly mtproto: MtprotoService,
  ) {}

  // ─────────────────────── Bot init ────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    try {
      await this.bot.telegram.setMyCommands(
        [
          { command: 'start', description: '🏠 Menu / Menyu / Меню' },
          {
            command: 'add',
            description:
              '🛡 Himoyalangan foydalanuvchi / Защищённый пользователь',
          },
        ],
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
      this.groupsCache.delete(from.id);
      this.logger.log(`Bot removed from: ${chat.title}`);
      return;
    }

    if (!['member', 'administrator'].includes(newStatus)) return;

    const t = this.t(from.id);

    // Allow creator and administrators to add the bot
    let adderStatus: string | null = null;
    try {
      const member = await ctx.telegram.getChatMember(chat.id, from.id);
      adderStatus = member.status;
      if (adderStatus !== 'creator' && adderStatus !== 'administrator') {
        this.logger.warn(
          `Non-admin (${from.id}) tried to add bot to "${chat.title}"`,
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

    // Persist group and user
    const group = await this.groupsService.findOrCreate(
      chat.id,
      chat.title,
      chat.type,
      chat.username,
    );
    const user = await this.usersService.findOrCreate(
      from.id,
      from.first_name,
      from.last_name,
      from.username,
    );

    // Save admin record (owner gets auto-access)
    try {
      await this.adminsService.saveAdmin(
        group.id,
        user.id,
        String(from.id),
        adderStatus === 'creator',
      );
    } catch {}

    this.logger.log(`Bot added to group: "${chat.title}" (${chat.id})`);
    this.groupsCache.delete(from.id);

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

      // Private chat
      if (ctx.chat?.type === 'private') {
        // Handle /add command
        if (text === '/add') {
          await this.sendProtectedUsersMenu(ctx);
          return;
        }

        // Handle text input for states
        if (!text.startsWith('/')) {
          const state = this.deleteStates.get(ctx.from.id);
          if (state) {
            await this.handleStateInput(ctx, text, state);
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
      const userId = ctx.from!.id;

      await this.usersService.findOrCreate(
        userId,
        ctx.from!.first_name,
        ctx.from!.last_name,
        ctx.from!.username,
      );

      // Load language from DB if not already in memory
      if (!this.langMap.has(userId)) {
        const dbLang = await this.usersService.getLang(userId);
        if (!dbLang) {
          await this.sendLangSelect(ctx, false);
          return;
        }
        this.langMap.set(userId, dbLang as Lang);
      }

      await this.sendMainMenu(ctx, false);
    } catch (err) {
      this.logger.error('onStart error', err);
    }
  }

  // ─────────────────────── Language selection ───────────────────────────────

  private async sendLangSelect(ctx: Context, edit: boolean): Promise<void> {
    const text = '🌐 <b>Tilni tanlang / Выберите язык:</b>';
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

  @Action(/^lang:(uz|ru)$/)
  async onLangSelect(@Ctx() ctx: Context): Promise<void> {
    const code = ((ctx as any).callbackQuery?.data as string).split(
      ':',
    )[1] as Lang;
    const userId = ctx.from!.id;
    this.langMap.set(userId, code);
    try {
      await this.usersService.setLang(userId, code);
    } catch {}
    const t = this.t(userId);
    await (ctx as any).answerCbQuery(t.langChanged, { show_alert: false });
    await this.sendMainMenu(ctx, true);
  }

  // ──────────────────────── Main menu ──────────────────────────────────────

  private async getMyGroups(
    userId: number,
  ): Promise<Array<{ telegramId: string; title: string }>> {
    const now = Date.now();
    const cached = this.groupsCache.get(userId);
    if (cached && now - cached.cachedAt < this.GROUPS_CACHE_TTL) {
      return cached.groups;
    }

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
        } else if (member.status === 'administrator') {
          const hasAccess = await this.adminsService.hasAccess(
            group.telegramId,
            String(userId),
          );
          if (hasAccess) {
            myGroups.push({
              telegramId: group.telegramId,
              title: group.title,
            });
          }
        }
      } catch {}
    }

    this.groupsCache.set(userId, { groups: myGroups, cachedAt: now });
    return myGroups;
  }

  /** Check if user is creator of at least one active group */
  private async isOwnerOfAny(userId: number): Promise<boolean> {
    const allGroups = await this.groupsService.getActiveGroups();
    for (const group of allGroups) {
      try {
        const member = await this.bot.telegram.getChatMember(
          Number(group.telegramId),
          userId,
        );
        if (member.status === 'creator') return true;
      } catch {}
    }
    return false;
  }

  private async sendMainMenu(ctx: Context, edit: boolean): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const botInfo = await this.bot.telegram.getMe();
    const addUrl = `https://t.me/${botInfo.username}?startgroup=true`;
    const myGroups = await this.getMyGroups(userId);
    const status = this.mtStatus(userId);
    const isOwner = await this.isOwnerOfAny(userId);

    let text: string;
    let keyboard: any[][];

    if (myGroups.length === 0) {
      text = t.menuNoGroups(status);
      keyboard = [
        [{ text: t.btnAddGroup, url: addUrl }],
        [{ text: t.btnProtected, callback_data: 'protected:list' }],
        [
          { text: t.btnHelp, callback_data: 'help' },
          { text: t.langBtn, callback_data: 'lang:select' },
        ],
      ];
    } else {
      const list = myGroups.map((g) => '• ' + g.title).join('\n');
      text = t.menuHasGroups(status, myGroups.length, list);

      if (isOwner) {
        keyboard = [
          [{ text: t.btnDelete, callback_data: 'delete:start' }],
          [
            { text: t.btnProtected, callback_data: 'protected:list' },
            { text: t.btnAccess, callback_data: 'access:start' },
          ],
          [{ text: t.btnAddNew, url: addUrl }],
          [
            { text: t.btnHelp, callback_data: 'help' },
            { text: t.langBtn, callback_data: 'lang:select' },
          ],
        ];
      } else {
        keyboard = [
          [{ text: t.btnDelete, callback_data: 'delete:start' }],
          [{ text: t.btnProtected, callback_data: 'protected:list' }],
          [
            { text: t.btnHelp, callback_data: 'help' },
            { text: t.langBtn, callback_data: 'lang:select' },
          ],
        ];
      }
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

  // ═══════════════════════════════════════════════════════════════════════════
  //  CALENDAR
  // ═══════════════════════════════════════════════════════════════════════════

  private renderCalendar(
    lang: Lang,
    year: number,
    month: number,
    selectedStart?: Date,
  ): any[][] {
    const monthName = MONTH_NAMES[lang][month];
    const headers = DAY_HEADERS[lang];

    const rows: any[][] = [];

    // Row 1: navigation
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    rows.push([
      {
        text: '◀️',
        callback_data: `cal:prev:${prevYear}-${pad2(prevMonth + 1)}`,
      },
      { text: `${monthName} ${year}`, callback_data: 'cal:noop' },
      {
        text: '▶️',
        callback_data: `cal:next:${nextYear}-${pad2(nextMonth + 1)}`,
      },
    ]);

    // Row 2: day headers
    rows.push(headers.map((h) => ({ text: h, callback_data: 'cal:noop' })));

    // Build day grid
    const firstDay = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    // Monday = 0
    let startDow = firstDay.getUTCDay() - 1;
    if (startDow < 0) startDow = 6;

    const selectedStr = selectedStart ? dateStr(selectedStart) : '';

    let row: any[] = [];
    // Fill leading blanks
    for (let i = 0; i < startDow; i++) {
      row.push({ text: ' ', callback_data: 'cal:noop' });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      const isSelected = ds === selectedStr;
      row.push({
        text: isSelected ? `✅${d}` : String(d),
        callback_data: `cal:day:${ds}`,
      });
      if (row.length === 7) {
        rows.push(row);
        row = [];
      }
    }
    // Fill trailing blanks
    if (row.length > 0) {
      while (row.length < 7) {
        row.push({ text: ' ', callback_data: 'cal:noop' });
      }
      rows.push(row);
    }

    return rows;
  }

  private async showCalendar(
    ctx: Context,
    state: DeleteState,
    edit: boolean,
  ): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const lang = this.lang(userId);

    const now = new Date();
    const year = state.calendarYear ?? now.getUTCFullYear();
    const month = state.calendarMonth ?? now.getUTCMonth();

    const calendarRows = this.renderCalendar(
      lang,
      year,
      month,
      state.startDate,
    );

    // Bottom row
    calendarRows.push([{ text: t.btnCancel, callback_data: 'cal:cancel' }]);

    let headerText: string;
    if (state.step === 'select_start_date') {
      headerText = t.calendarSelectStart;
    } else {
      headerText = t.calendarSelectEnd(dateStr(state.startDate!));
    }

    const text =
      headerText +
      '\n\n' +
      t.calendarTitle(state.groupTitle, MONTH_NAMES[lang][month], year);

    const opts: any = {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: calendarRows },
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

  @Action('cal:noop')
  async onCalNoop(@Ctx() ctx: Context): Promise<void> {
    try {
      await (ctx as any).answerCbQuery();
    } catch {}
  }

  @Action(/^cal:prev:(\d{4}-\d{2})$/)
  async onCalPrev(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const state = this.deleteStates.get(userId);
    if (!state) {
      try {
        await (ctx as any).answerCbQuery();
      } catch {}
      return;
    }
    const data = (ctx as any).callbackQuery?.data as string;
    const [y, m] = data.replace('cal:prev:', '').split('-').map(Number);
    state.calendarYear = y;
    state.calendarMonth = m - 1;
    await this.showCalendar(ctx, state, true);
  }

  @Action(/^cal:next:(\d{4}-\d{2})$/)
  async onCalNext(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const state = this.deleteStates.get(userId);
    if (!state) {
      try {
        await (ctx as any).answerCbQuery();
      } catch {}
      return;
    }
    const data = (ctx as any).callbackQuery?.data as string;
    const [y, m] = data.replace('cal:next:', '').split('-').map(Number);
    state.calendarYear = y;
    state.calendarMonth = m - 1;
    await this.showCalendar(ctx, state, true);
  }

  @Action(/^cal:day:(\d{4}-\d{2}-\d{2})$/)
  async onCalDay(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const state = this.deleteStates.get(userId);
    if (!state) {
      try {
        await (ctx as any).answerCbQuery();
      } catch {}
      return;
    }

    const data = (ctx as any).callbackQuery?.data as string;
    const ds = data.replace('cal:day:', '');
    const selectedDate = new Date(ds + 'T00:00:00.000Z');

    if (state.step === 'select_start_date') {
      state.startDate = selectedDate;
      state.step = 'select_end_date';
      // Navigate calendar to that month
      state.calendarYear = selectedDate.getUTCFullYear();
      state.calendarMonth = selectedDate.getUTCMonth();
      await this.showCalendar(ctx, state, true);
    } else if (state.step === 'select_end_date') {
      const endDate = selectedDate;
      if (state.startDate! > endDate) {
        try {
          await (ctx as any).answerCbQuery(t.dateOrderError, {
            show_alert: true,
          });
        } catch {}
        return;
      }
      // Show confirmation
      const fromStr = dateStr(state.startDate!);
      const toStr = dateStr(endDate);

      // Store end date temporarily in calendarYear/Month (reuse fields)
      // stash in state for confirm handler
      (state as any).endDate = endDate;

      await (ctx as any).editMessageText(t.calendarConfirm(fromStr, toStr), {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: t.btnConfirm, callback_data: 'cal:confirm' },
              { text: t.btnCancel, callback_data: 'cal:cancel' },
            ],
          ],
        },
      });
      try {
        await (ctx as any).answerCbQuery();
      } catch {}
    }
  }

  @Action('cal:confirm')
  async onCalConfirm(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const state = this.deleteStates.get(userId);
    if (!state || !state.startDate || !(state as any).endDate) {
      try {
        await (ctx as any).answerCbQuery();
      } catch {}
      return;
    }

    const fromDate = state.startDate;
    const toDate = new Date(
      (state as any).endDate.getTime() +
        23 * 3600000 +
        59 * 60000 +
        59 * 1000 +
        999,
    ); // end of day

    const username = state.targetUsername ?? null;
    const groupTelegramId = state.groupTelegramId;
    const groupTitle = state.groupTitle;

    this.deleteStates.delete(userId);
    try {
      await (ctx as any).answerCbQuery();
    } catch {}

    await this.executeDelete(
      ctx,
      groupTelegramId,
      groupTitle,
      fromDate,
      toDate,
      username,
    );
  }

  @Action('cal:cancel')
  async onCalCancel(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    this.deleteStates.delete(userId);
    await this.sendMainMenu(ctx, true);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PROTECTED USERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async sendProtectedUsersMenu(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const protectedUsers = await this.adminsService.getProtectedUsers(
      String(userId),
    );

    let text: string;
    const keyboard: any[][] = [];

    if (protectedUsers.length === 0) {
      text = t.addEmpty;
    } else {
      const list = protectedUsers
        .map((p, i) => `${i + 1}. @${p.username}`)
        .join('\n');
      text = t.addList(list);
      // Add remove buttons for each
      for (const p of protectedUsers) {
        keyboard.push([
          {
            text: `❌ @${p.username}`,
            callback_data: `prot:rem:${p.username}`,
          },
        ]);
      }
    }

    keyboard.push([{ text: t.btnAddUser, callback_data: 'protected:add' }]);
    keyboard.push([{ text: t.btnBack, callback_data: 'menu:main' }]);

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  @Action('protected:list')
  async onProtectedList(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const protectedUsers = await this.adminsService.getProtectedUsers(
      String(userId),
    );

    let text: string;
    const keyboard: any[][] = [];

    if (protectedUsers.length === 0) {
      text = t.addEmpty;
    } else {
      const list = protectedUsers
        .map((p, i) => `${i + 1}. @${p.username}`)
        .join('\n');
      text = t.addList(list);
      for (const p of protectedUsers) {
        keyboard.push([
          {
            text: `❌ @${p.username}`,
            callback_data: `prot:rem:${p.username}`,
          },
        ]);
      }
    }

    keyboard.push([{ text: t.btnAddUser, callback_data: 'protected:add' }]);
    keyboard.push([{ text: t.btnBack, callback_data: 'menu:main' }]);

    try {
      await (ctx as any).editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch {}
    try {
      await (ctx as any).answerCbQuery();
    } catch {}
  }

  @Action('protected:add')
  async onProtectedAdd(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);

    this.deleteStates.set(userId, {
      step: 'awaiting_add_username',
      groupTelegramId: 0,
      groupTitle: '',
    });

    try {
      await (ctx as any).editMessageText(t.addPrompt, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t.btnCancel, callback_data: 'protected:list' }],
          ],
        },
      });
    } catch {}
    try {
      await (ctx as any).answerCbQuery();
    } catch {}
  }

  @Action(/^prot:rem:(.+)$/)
  async onProtectedRemove(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const data = (ctx as any).callbackQuery?.data as string;
    const username = data.replace('prot:rem:', '');

    await this.adminsService.removeProtectedUser(String(userId), username);
    try {
      await (ctx as any).answerCbQuery(t.addRemoved(username), {
        show_alert: false,
      });
    } catch {}

    // Refresh list
    await this.onProtectedList(ctx);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ACCESS MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  @Action('access:start')
  async onAccessStart(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);

    // Get groups where user is owner
    const allGroups = await this.groupsService.getActiveGroups();
    const ownerGroups: Array<{ telegramId: string; title: string }> = [];
    for (const group of allGroups) {
      try {
        const member = await this.bot.telegram.getChatMember(
          Number(group.telegramId),
          userId,
        );
        if (member.status === 'creator') {
          ownerGroups.push({
            telegramId: group.telegramId,
            title: group.title,
          });
        }
      } catch {}
    }

    if (ownerGroups.length === 0) {
      try {
        await (ctx as any).editMessageText(t.noGroups, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: t.btnBack, callback_data: 'menu:main' }],
            ],
          },
        });
      } catch {}
      try {
        await (ctx as any).answerCbQuery();
      } catch {}
      return;
    }

    if (ownerGroups.length === 1) {
      await this.showAccessList(ctx, ownerGroups[0].telegramId, true);
      return;
    }

    const keyboard = [
      ...ownerGroups.map((g) => [
        {
          text: '📋 ' + g.title,
          callback_data: 'access:g:' + g.telegramId,
        },
      ]),
      [{ text: t.btnBack, callback_data: 'menu:main' }],
    ];

    try {
      await (ctx as any).editMessageText(t.accessSelectGroup, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch {}
    try {
      await (ctx as any).answerCbQuery();
    } catch {}
  }

  @Action(/^access:g:(.+)$/)
  async onAccessGroupSelect(@Ctx() ctx: Context): Promise<void> {
    const data = (ctx as any).callbackQuery?.data as string;
    const groupTelegramId = data.replace('access:g:', '');
    await this.showAccessList(ctx, groupTelegramId, true);
  }

  private async showAccessList(
    ctx: Context,
    groupTelegramId: string,
    edit: boolean,
  ): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const group = await this.groupsService.findByTelegramId(groupTelegramId);
    if (!group) {
      try {
        await (ctx as any).answerCbQuery(t.groupNotFound);
      } catch {}
      return;
    }

    const accessList =
      await this.adminsService.getGroupAccessList(groupTelegramId);
    // Filter out owner from revoke list (they always have access)
    const nonOwners = accessList.filter((a) => !a.isOwner);

    let text: string;
    const keyboard: any[][] = [];

    if (nonOwners.length === 0) {
      text = t.accessEmpty(group.title);
    } else {
      const list = nonOwners
        .map(
          (a, i) =>
            `${i + 1}. ${a.user?.username ? '@' + a.user.username : a.telegramUserId}`,
        )
        .join('\n');
      text = t.accessList(group.title, list);

      for (const a of nonOwners) {
        const label = a.user?.username
          ? `❌ @${a.user.username}`
          : `❌ ${a.telegramUserId}`;
        keyboard.push([
          {
            text: label,
            callback_data: `access:rev:${groupTelegramId}:${a.telegramUserId}`,
          },
        ]);
      }
    }

    keyboard.push([
      {
        text: t.btnAddUser,
        callback_data: `access:add:${groupTelegramId}`,
      },
    ]);
    keyboard.push([{ text: t.btnBack, callback_data: 'access:start' }]);

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

  @Action(/^access:add:(.+)$/)
  async onAccessAdd(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const data = (ctx as any).callbackQuery?.data as string;
    const groupTelegramId = data.replace('access:add:', '');

    this.deleteStates.set(userId, {
      step: 'awaiting_access_username',
      groupTelegramId: 0,
      groupTitle: '',
      accessGroupTelegramId: groupTelegramId,
    });

    try {
      await (ctx as any).editMessageText(t.accessPrompt, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: t.btnCancel,
                callback_data: `access:g:${groupTelegramId}`,
              },
            ],
          ],
        },
      });
    } catch {}
    try {
      await (ctx as any).answerCbQuery();
    } catch {}
  }

  @Action(/^access:rev:(.+):(.+)$/)
  async onAccessRevoke(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const data = (ctx as any).callbackQuery?.data as string;
    const parts = data.replace('access:rev:', '').split(':');
    const groupTelegramId = parts[0];
    const targetTelegramUserId = parts[1];

    const group = await this.groupsService.findByTelegramId(groupTelegramId);
    await this.adminsService.revokeDeleteAccess(
      groupTelegramId,
      targetTelegramUserId,
    );

    const targetUser =
      await this.usersService.findByTelegramId(targetTelegramUserId);
    const uname = targetUser?.username || targetTelegramUserId;

    try {
      await (ctx as any).answerCbQuery(
        t.accessRevoked(uname, group?.title ?? ''),
      );
    } catch {}

    // Invalidate groups cache for the revoked user
    this.groupsCache.delete(Number(targetTelegramUserId));

    await this.showAccessList(ctx, groupTelegramId, true);
  }

  // ─────────────────── Delete: group selection ─────────────────────────────

  @Action('delete:start')
  async onDeleteStart(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const myGroups = await this.getMyGroups(userId);

    if (myGroups.length === 0) {
      await (ctx as any).editMessageText(t.noGroups, {
        parse_mode: 'HTML',
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
          [
            {
              text: t.btnAllMsgs,
              callback_data: 'del:all:' + groupTelegramId,
            },
          ],
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

  // ──────────────────── Delete: calendar / username prompts ─────────────────

  @Action(/^del:all:(.+)$/)
  async onDeleteAllPrompt(@Ctx() ctx: Context): Promise<void> {
    const cbData = (ctx as any).callbackQuery?.data as string;
    const groupTelegramId = cbData.replace('del:all:', '');
    const group = await this.groupsService.findByTelegramId(groupTelegramId);
    const userId = ctx.from!.id;

    const now = new Date();
    this.deleteStates.set(userId, {
      step: 'select_start_date',
      groupTelegramId: Number(groupTelegramId),
      groupTitle: group?.title ?? 'Group',
      calendarYear: now.getUTCFullYear(),
      calendarMonth: now.getUTCMonth(),
    });

    const state = this.deleteStates.get(userId)!;
    await this.showCalendar(ctx, state, true);
  }

  @Action(/^del:user:(.+)$/)
  async onDeleteUserPrompt(@Ctx() ctx: Context): Promise<void> {
    const cbData = (ctx as any).callbackQuery?.data as string;
    const groupTelegramId = cbData.replace('del:user:', '');
    const group = await this.groupsService.findByTelegramId(groupTelegramId);
    const userId = ctx.from!.id;
    const t = this.t(userId);

    this.deleteStates.set(userId, {
      step: 'awaiting_username',
      groupTelegramId: Number(groupTelegramId),
      groupTitle: group?.title ?? 'Group',
    });

    await (ctx as any).editMessageText(
      t.inputUsername(group?.title ?? 'Group'),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t.btnCancel, callback_data: 'cal:cancel' }],
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
    await this.sendMainMenu(ctx, true);
  }

  // ─────────────────── Text input handler ──────────────────────────────────

  private async handleStateInput(
    ctx: Context,
    text: string,
    state: DeleteState,
  ): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);

    // Protected user add
    if (state.step === 'awaiting_add_username') {
      const clean = text.trim().replace(/^@/, '');
      if (!clean || clean.length < 2) {
        await ctx.reply(t.badFormat + t.addPrompt, { parse_mode: 'HTML' });
        return;
      }
      this.deleteStates.delete(userId);
      const added = await this.adminsService.addProtectedUser(
        String(userId),
        clean,
      );
      if (added) {
        await ctx.reply(t.addSuccess(clean), { parse_mode: 'HTML' });
      } else {
        await ctx.reply(t.addAlready(clean), { parse_mode: 'HTML' });
      }
      // Show updated list
      await this.sendProtectedUsersMenu(ctx);
      return;
    }

    // Access management — add username
    if (state.step === 'awaiting_access_username') {
      const groupTelegramId = state.accessGroupTelegramId!;
      const clean = text.trim().replace(/^@/, '');
      if (!clean || clean.length < 2) {
        await ctx.reply(t.badFormat + t.accessPrompt, { parse_mode: 'HTML' });
        return;
      }
      this.deleteStates.delete(userId);

      // Check if user exists in DB
      const targetUser = await this.usersService.findByUsername(clean);
      if (!targetUser) {
        await ctx.reply(t.userNotFound(clean), { parse_mode: 'HTML' });
        return;
      }

      // Check if this user is admin in the group
      try {
        const member = await this.bot.telegram.getChatMember(
          Number(groupTelegramId),
          Number(targetUser.telegramId),
        );
        if (member.status !== 'administrator' && member.status !== 'creator') {
          await ctx.reply(t.accessNotAdmin, { parse_mode: 'HTML' });
          return;
        }
      } catch {
        await ctx.reply(t.accessNotAdmin, { parse_mode: 'HTML' });
        return;
      }

      // Save admin record and grant access
      const group = await this.groupsService.findByTelegramId(groupTelegramId);
      if (group) {
        await this.adminsService.saveAdmin(
          group.id,
          targetUser.id,
          targetUser.telegramId,
          false,
        );
        await this.adminsService.grantDeleteAccess(
          groupTelegramId,
          targetUser.telegramId,
        );
      }

      // Invalidate target user's groups cache
      this.groupsCache.delete(Number(targetUser.telegramId));

      await ctx.reply(t.accessGranted(clean, group?.title ?? ''), {
        parse_mode: 'HTML',
      });
      await this.showAccessList(ctx, groupTelegramId, false);
      return;
    }

    // Username input for single-user delete
    if (state.step === 'awaiting_username') {
      const clean = text.trim().replace(/^@/, '');
      if (!clean || clean.length < 2) {
        await ctx.reply(t.badFormat + t.inputUsername(state.groupTitle), {
          parse_mode: 'HTML',
        });
        return;
      }
      // Switch to calendar for date selection
      state.targetUsername = clean;
      state.step = 'select_start_date';
      const now = new Date();
      state.calendarYear = now.getUTCFullYear();
      state.calendarMonth = now.getUTCMonth();
      await this.showCalendar(ctx, state, false);
      return;
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

      // ── Build exclude list: owner + bot + protected users ────────────────
      const botInfo = await this.bot.telegram.getMe();
      const excludeIds: number[] = [];
      if (ownerNumericId) excludeIds.push(ownerNumericId);
      excludeIds.push(botInfo.id);

      // Add protected users' numeric IDs
      try {
        const protectedUsernames =
          await this.adminsService.getProtectedUsernames(String(userId));
        for (const uname of protectedUsernames) {
          const pUser = await this.usersService.findByUsername(uname);
          if (pUser) excludeIds.push(Number(pUser.telegramId));
        }
      } catch {}

      // Also exclude by ownerTelegramId string for Bot API path
      const excludeTelegramIds = new Set<string>();
      for (const id of excludeIds) excludeTelegramIds.add(String(id));

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

      const r = range(fromDate, toDate);

      // Track fallback for mode label
      let usedFallback = false;

      // ════════════════════════════════════════════════════════════════════
      //  STRATEGY A: MTProto (USER session) — reads Telegram history directly
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
          usedFallback = true;
          await edit(t.notMemberWarning);
          await new Promise((r) => setTimeout(r, 1500));
          // falls through to Strategy B below
        } else if (result.total === 0) {
          await edit(
            username ? t.notFoundUser('@' + username, r) : t.notFound(r),
          );
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
              .filter((m) => !excludeTelegramIds.has(String(m.telegramUserId)))
              .map((m) => m.id);
            if (dbIds.length)
              await this.messagesService.deleteMessagesFromDb(dbIds);
          } catch {}

          const mode = this.modeLabel(userId);
          const summary = username
            ? t.resultUser(groupTitle, '@' + username, result.deleted, r, mode)
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
      // ════════════════════════════════════════════════════════════════════
      const messages = await this.messagesService.getMessagesByDateRange(
        groupTelegramId,
        fromDate,
        toDate,
        targetTelegramId,
      );

      const toDelete = messages.filter(
        (m) => !excludeTelegramIds.has(String(m.telegramUserId)),
      );

      if (toDelete.length === 0) {
        await edit(
          username ? t.notFoundUser('@' + username, r) : t.notFound(r),
        );
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

      const mode = usedFallback ? t.botApiMode : this.modeLabel(userId);
      const summary = username
        ? t.resultUser(groupTitle, '@' + username, deleted, r, mode)
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
