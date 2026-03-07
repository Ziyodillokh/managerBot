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

/* ───── State Interface ────────────────────────────────────────────────── */

interface DeleteState {
  step:
    | 'select_start_date'
    | 'select_end_date'
    | 'awaiting_add_username'
    | 'awaiting_access_username';
  groupTelegramId: number;
  groupTitle: string;
  calendarYear?: number;
  calendarMonth?: number;
  startDate?: Date;
  endDate?: Date;
  accessGroupTelegramId?: string;
  createdAt: number; // Date.now() — for TTL cleanup
}

/* ───── Helpers ────────────────────────────────────────────────────────── */

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function dateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function rangeStr(from: Date, to: Date): string {
  return dateStr(from) + ' — ' + dateStr(to);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

@Update()
export class TelegramUpdate implements OnModuleInit {
  private readonly logger = new Logger(TelegramUpdate.name);
  private readonly deleteStates = new Map<number, DeleteState>();
  private readonly langMap = new Map<number, Lang>();
  private readonly groupsCache = new Map<
    number,
    { groups: Array<{ telegramId: string; title: string }>; cachedAt: number }
  >();
  private readonly GROUPS_CACHE_TTL = 60_000;
  /** Max age for deleteStates / langMap entries (30 min) */
  private readonly STATE_TTL = 30 * 60_000;

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly groupsService: GroupsService,
    private readonly usersService: UsersService,
    private readonly messagesService: MessagesService,
    private readonly adminsService: AdminsService,
    private readonly mtproto: MtprotoService,
  ) {}

  /* ═══════ Lifecycle ══════════════════════════════════════════════════ */

  async onModuleInit(): Promise<void> {
    try {
      await this.bot.telegram.setMyCommands(
        [
          { command: 'start', description: '🏠 Menu / Menyu / Меню' },
          { command: 'add', description: '🛡 Himoyalangan / Защищённые' },
        ],
        { scope: { type: 'all_private_chats' } },
      );
      await this.bot.telegram.setMyCommands([], {
        scope: { type: 'all_group_chats' },
      });
      await this.bot.telegram.setMyCommands([]);
      this.logger.log('Commands registered');
    } catch (err) {
      this.logger.error('Failed to register commands', err);
    }
  }

  /* ═══════ i18n Helpers ═════════════════════════════════════════════ */

  /** Evict stale deleteStates entries older than STATE_TTL */
  private cleanupStaleStates(): void {
    const now = Date.now();
    for (const [uid, st] of this.deleteStates) {
      if (now - st.createdAt > this.STATE_TTL) this.deleteStates.delete(uid);
    }
    // langMap can grow unbounded — trim entries beyond 10 000
    if (this.langMap.size > 10_000) this.langMap.clear();
  }

  private lang(userId: number): Lang {
    return this.langMap.get(userId) ?? 'uz';
  }

  private t(userId: number): (typeof T)[Lang] {
    return T[this.lang(userId)];
  }

  private mtStatus(userId: number): string {
    return this.mtproto.isReady() ? this.t(userId).mtOn : this.t(userId).mtOff;
  }

  private modeLabel(userId: number): string {
    return this.mtproto.isReady()
      ? this.t(userId).mtMode
      : this.t(userId).botApiMode;
  }

  /* ═══════ Bot Added / Removed from Group ═══════════════════════════ */

  @On('my_chat_member')
  async onMyChatMember(@Ctx() ctx: Context): Promise<void> {
    const update = (ctx.update as any).my_chat_member;
    if (!update) return;

    const chat = update.chat;
    const from = update.from;
    const newStatus = update.new_chat_member?.status;
    if (chat.type === 'private') return;

    if (['left', 'kicked'].includes(newStatus)) {
      await this.groupsService.deactivate(chat.id);
      this.groupsCache.clear();
      this.logger.log(`Bot removed from: ${chat.title}`);
      return;
    }

    if (!['member', 'administrator'].includes(newStatus)) return;

    const t = this.t(from.id);

    let adderStatus: string | null = null;
    try {
      const member = await ctx.telegram.getChatMember(chat.id, from.id);
      adderStatus = member.status;
      if (adderStatus !== 'creator' && adderStatus !== 'administrator') {
        this.logger.warn(
          `Non-admin ${from.id} tried to add bot to "${chat.title}"`,
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
      this.logger.error('getChatMember error in onMyChatMember', err);
      return; // CRITICAL FIX: could not verify → reject for safety
    }

    try {
      const botInfo = await this.bot.telegram.getMe();
      const bm = await ctx.telegram.getChatMember(chat.id, botInfo.id);
      if (bm.status !== 'administrator') {
        try {
          await ctx.telegram.sendMessage(from.id, t.noAdminRights(chat.title), {
            parse_mode: 'HTML',
          });
        } catch {}
      }
    } catch {}

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

    try {
      await this.adminsService.saveAdmin(
        group.id,
        user.id,
        String(from.id),
        adderStatus === 'creator',
      );
    } catch {}

    this.logger.log(`Bot added to: "${chat.title}" (${chat.id})`);
    this.groupsCache.clear();

    try {
      await ctx.telegram.sendMessage(from.id, t.addedToGroup(chat.title), {
        parse_mode: 'HTML',
      });
    } catch {}
  }

  /* ═══════ Message Tracking ═════════════════════════════════════════ */

  @On('message')
  async onMessage(
    @Ctx() ctx: Context,
    @Next() next: () => Promise<void>,
  ): Promise<void> {
    try {
      const msg = ctx.message as any;
      if (!msg || !ctx.from) return next();

      const text: string = msg.text ?? '';

      if (ctx.chat?.type === 'private') {
        if (text === '/add') {
          await this.sendProtectedUsersMenu(ctx);
          return;
        }
        if (!text.startsWith('/')) {
          const state = this.deleteStates.get(ctx.from.id);
          if (state) {
            await this.handleStateInput(ctx, text, state);
            return;
          }
        }
        return next();
      }

      /* Group message → track */
      if (text.startsWith('/')) return next();

      // Skip messages sent on behalf of the group/channel (anonymous admin)
      if (msg.sender_chat) return next();

      // Skip messages from bots — they must never be deleted
      if (ctx.from.is_bot) return next();

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

      await this.messagesService.saveMessage(
        msg.message_id,
        ctx.chat!.id,
        ctx.from.id,
        ctx.from.first_name,
        new Date(msg.date * 1000),
        text || undefined,
        ctx.from.username,
        ctx.from.last_name,
      );
    } catch (err) {
      this.logger.error('onMessage error', err);
    }
    return next();
  }

  /* ═══════ /start ═══════════════════════════════════════════════════ */

  @Start()
  async onStart(@Ctx() ctx: Context): Promise<void> {
    try {
      if (ctx.chat?.type !== 'private') return;
      if (!ctx.from) return;
      this.deleteStates.delete(ctx.from.id);
      this.cleanupStaleStates();

      const userId = ctx.from.id;
      await this.usersService.findOrCreate(
        userId,
        ctx.from.first_name,
        ctx.from.last_name,
        ctx.from.username,
      );

      if (!this.langMap.has(userId)) {
        const dbLang = await this.usersService.getLang(userId);
        if (!dbLang || (dbLang !== 'uz' && dbLang !== 'ru')) {
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

  /* ═══════ Language ═════════════════════════════════════════════════ */

  private async sendLangSelect(ctx: Context, edit: boolean): Promise<void> {
    const text = '🌐 <b>Tilni tanlang / Выберите язык:</b>';
    const keyboard = [
      Object.entries(LANG_LABELS).map(([c, l]) => ({
        text: l,
        callback_data: 'lang:' + c,
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
    await (ctx as any).answerCbQuery(this.t(userId).langChanged, {
      show_alert: false,
    });
    await this.sendMainMenu(ctx, true);
  }

  /* ═══════ Main Menu ════════════════════════════════════════════════ */

  private async getMyGroups(
    userId: number,
  ): Promise<Array<{ telegramId: string; title: string }>> {
    const now = Date.now();
    const cached = this.groupsCache.get(userId);
    if (cached && now - cached.cachedAt < this.GROUPS_CACHE_TTL)
      return cached.groups;

    const allGroups = await this.groupsService.getActiveGroups();
    const myGroups: Array<{ telegramId: string; title: string }> = [];

    const results = await Promise.allSettled(
      allGroups.map(async (g) => {
        const m = await this.bot.telegram.getChatMember(
          Number(g.telegramId),
          userId,
        );
        return { g, status: m.status };
      }),
    );

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { g, status } = r.value;
      if (status === 'creator') {
        myGroups.push({ telegramId: g.telegramId, title: g.title });
      } else if (status === 'administrator') {
        if (await this.adminsService.hasAccess(g.telegramId, String(userId))) {
          myGroups.push({ telegramId: g.telegramId, title: g.title });
        }
      }
    }

    this.groupsCache.set(userId, { groups: myGroups, cachedAt: now });
    return myGroups;
  }

  private async sendMainMenu(ctx: Context, edit: boolean): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const botInfo = await this.bot.telegram.getMe();
    const addUrl = `https://t.me/${botInfo.username}?startgroup=true`;
    const myGroups = await this.getMyGroups(userId);
    const status = this.mtStatus(userId);
    const isOwner = await this.adminsService.isOwnerOfAny(String(userId));

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

  /* ═══════ Help ═════════════════════════════════════════════════════ */

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

  /* ═══════════════════════════════════════════════════════════════════
   *  CALENDAR
   * ═══════════════════════════════════════════════════════════════════ */

  private renderCalendar(
    lang: Lang,
    year: number,
    month: number,
    selectedStart?: Date,
    selectedEnd?: Date,
  ): any[][] {
    const mName = MONTH_NAMES[lang][month];
    const headers = DAY_HEADERS[lang];
    const rows: any[][] = [];

    /* Nav row */
    const pm = month === 0 ? 11 : month - 1;
    const py = month === 0 ? year - 1 : year;
    const nm = month === 11 ? 0 : month + 1;
    const ny = month === 11 ? year + 1 : year;

    rows.push([
      { text: '◀️', callback_data: `cal:nav:${py}-${pad2(pm + 1)}` },
      { text: `${mName} ${year}`, callback_data: 'cal:noop' },
      { text: '▶️', callback_data: `cal:nav:${ny}-${pad2(nm + 1)}` },
    ]);

    /* Day-of-week headers */
    rows.push(headers.map((h) => ({ text: h, callback_data: 'cal:noop' })));

    /* Day grid */
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    let startDow = new Date(Date.UTC(year, month, 1)).getUTCDay() - 1;
    if (startDow < 0) startDow = 6;

    const todayStr = dateStr(new Date(Date.now() + 5 * 3600_000)); // UTC+5
    const startStr = selectedStart ? dateStr(selectedStart) : '';
    const endStr = selectedEnd ? dateStr(selectedEnd) : '';

    let row: any[] = [];
    for (let i = 0; i < startDow; i++)
      row.push({ text: ' ', callback_data: 'cal:noop' });

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      let label = String(d);
      if (ds === startStr) label = '🟢' + d;
      else if (ds === endStr) label = '🔴' + d;
      else if (startStr && endStr && ds > startStr && ds < endStr)
        label = '•' + d;
      else if (ds === todayStr) label = '📌' + d;

      row.push({ text: label, callback_data: `cal:day:${ds}` });
      if (row.length === 7) {
        rows.push(row);
        row = [];
      }
    }

    if (row.length > 0) {
      while (row.length < 7) row.push({ text: ' ', callback_data: 'cal:noop' });
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
    const now = new Date(Date.now() + 5 * 3600_000); // UTC+5 (Uzbekistan)
    const year = state.calendarYear ?? now.getUTCFullYear();
    const month = state.calendarMonth ?? now.getUTCMonth();

    const calRows = this.renderCalendar(
      lang,
      year,
      month,
      state.startDate,
      state.endDate,
    );

    /* Action row */
    const actionRow: any[] = [];
    if (year !== now.getUTCFullYear() || month !== now.getUTCMonth()) {
      actionRow.push({
        text: '📌 ' + t.btnToday,
        callback_data: `cal:nav:${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`,
      });
    }
    actionRow.push({ text: t.btnCancel, callback_data: 'cal:cancel' });
    calRows.push(actionRow);

    let header: string;
    if (state.step === 'select_start_date') {
      header = t.calendarSelectStart;
    } else {
      header = t.calendarSelectEnd(dateStr(state.startDate!));
    }

    const text =
      header +
      '\n\n' +
      t.calendarTitle(state.groupTitle, MONTH_NAMES[lang][month], year);

    const opts: any = {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: calRows },
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

  @Action(/^cal:nav:(\d{4}-\d{2})$/)
  async onCalNav(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const state = this.deleteStates.get(userId);
    if (!state) {
      try {
        await (ctx as any).answerCbQuery();
      } catch {}
      return;
    }
    const data = (ctx as any).callbackQuery?.data as string;
    const [y, m] = data.replace('cal:nav:', '').split('-').map(Number);
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
    // Build date in Uzbekistan time (UTC+5): midnight UZT = previous day 19:00 UTC
    const selected = new Date(ds + 'T00:00:00.000+05:00');

    if (state.step === 'select_start_date') {
      state.startDate = selected;
      state.step = 'select_end_date';
      state.calendarYear = selected.getUTCFullYear();
      state.calendarMonth = selected.getUTCMonth();
      await this.showCalendar(ctx, state, true);
      return;
    }

    if (state.step === 'select_end_date') {
      if (state.startDate! > selected) {
        try {
          await (ctx as any).answerCbQuery(t.dateOrderError, {
            show_alert: true,
          });
        } catch {}
        return;
      }
      state.endDate = selected;

      await (ctx as any).editMessageText(
        t.calendarConfirm(
          state.groupTitle,
          dateStr(state.startDate!),
          dateStr(selected),
        ),
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: t.btnConfirm, callback_data: 'cal:confirm' },
                { text: t.btnCancel, callback_data: 'cal:cancel' },
              ],
            ],
          },
        },
      );
      try {
        await (ctx as any).answerCbQuery();
      } catch {}
    }
  }

  @Action('cal:confirm')
  async onCalConfirm(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const state = this.deleteStates.get(userId);
    if (!state?.startDate || !state.endDate) {
      try {
        await (ctx as any).answerCbQuery();
      } catch {}
      return;
    }

    const fromDate = state.startDate;
    // endDate 23:59:59.999 UZT (the +05:00 offset is already baked into startDate/endDate)
    const toDate = new Date(state.endDate.getTime() + 86_399_999);
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
    );
  }

  @Action('cal:cancel')
  async onCalCancel(@Ctx() ctx: Context): Promise<void> {
    if (ctx.from) this.deleteStates.delete(ctx.from.id);
    await this.sendMainMenu(ctx, true);
  }

  /* ═══════════════════════════════════════════════════════════════════
   *  PROTECTED USERS
   * ═══════════════════════════════════════════════════════════════════ */

  private async sendProtectedUsersMenu(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const list = await this.adminsService.getProtectedUsers(String(userId));
    const keyboard: any[][] = [];
    let text: string;

    if (list.length === 0) {
      text = t.addEmpty;
    } else {
      text = t.addList(
        list.map((p, i) => `${i + 1}. @${p.username}`).join('\n'),
      );
      for (const p of list)
        keyboard.push([
          {
            text: `❌ @${p.username}`,
            callback_data: `prot:rem:${p.username}`,
          },
        ]);
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
    const list = await this.adminsService.getProtectedUsers(String(userId));
    const keyboard: any[][] = [];
    let text: string;

    if (list.length === 0) {
      text = t.addEmpty;
    } else {
      text = t.addList(
        list.map((p, i) => `${i + 1}. @${p.username}`).join('\n'),
      );
      for (const p of list)
        keyboard.push([
          {
            text: `❌ @${p.username}`,
            callback_data: `prot:rem:${p.username}`,
          },
        ]);
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
      createdAt: Date.now(),
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
    await this.onProtectedList(ctx);
  }

  /* ═══════════════════════════════════════════════════════════════════
   *  ACCESS MANAGEMENT
   * ═══════════════════════════════════════════════════════════════════ */

  @Action('access:start')
  async onAccessStart(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const allGroups = await this.groupsService.getActiveGroups();
    const ownerGroups: Array<{ telegramId: string; title: string }> = [];

    for (const g of allGroups) {
      try {
        const m = await this.bot.telegram.getChatMember(
          Number(g.telegramId),
          userId,
        );
        if (m.status === 'creator')
          ownerGroups.push({ telegramId: g.telegramId, title: g.title });
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
    await this.showAccessList(ctx, data.replace('access:g:', ''), true);
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
    const nonOwners = accessList.filter((a) => !a.isOwner);
    const keyboard: any[][] = [];
    let text: string;

    if (nonOwners.length === 0) {
      text = t.accessEmpty(group.title);
    } else {
      const listStr = nonOwners
        .map(
          (a, i) =>
            `${i + 1}. ${a.user?.username ? '@' + a.user.username : a.telegramUserId}`,
        )
        .join('\n');
      text = t.accessList(group.title, listStr);
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
    keyboard.push([{ text: t.btnBack, callback_data: 'menu:main' }]);

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
    const gid = ((ctx as any).callbackQuery?.data as string).replace(
      'access:add:',
      '',
    );
    this.deleteStates.set(userId, {
      step: 'awaiting_access_username',
      groupTelegramId: 0,
      groupTitle: '',
      accessGroupTelegramId: gid,
      createdAt: Date.now(),
    });
    try {
      await (ctx as any).editMessageText(t.accessPrompt, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t.btnCancel, callback_data: `access:g:${gid}` }],
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
    // format: access:rev:<groupTelegramId>:<telegramUserId>
    // groupTelegramId can be negative (e.g. -100xxx), so split from the LAST colon
    const lastColon = data.lastIndexOf(':');
    if (lastColon <= 0) return;
    const tid = data.slice(lastColon + 1);
    const gid = data.slice('access:rev:'.length, lastColon);
    if (!gid || !tid) return;

    const group = await this.groupsService.findByTelegramId(gid);
    if (!group) {
      try {
        await (ctx as any).answerCbQuery(t.groupNotFound);
      } catch {}
      return;
    }
    await this.adminsService.revokeDeleteAccess(gid, tid);
    const targetUser = await this.usersService.findByTelegramId(tid);
    const uname = targetUser?.username || tid;

    try {
      await (ctx as any).answerCbQuery(
        t.accessRevoked(uname, group?.title ?? ''),
      );
    } catch {}
    this.groupsCache.delete(Number(tid));
    await this.showAccessList(ctx, gid, true);
  }

  /* ═══════════════════════════════════════════════════════════════════
   *  DELETE FLOW
   * ═══════════════════════════════════════════════════════════════════ */

  /** Jump straight to calendar for a given group */
  private async startDeleteForGroup(
    ctx: Context,
    groupTelegramId: string,
    groupTitle: string,
    edit: boolean,
  ): Promise<void> {
    const userId = ctx.from!.id;
    const now = new Date();
    this.deleteStates.set(userId, {
      step: 'select_start_date',
      groupTelegramId: Number(groupTelegramId),
      groupTitle,
      calendarYear: now.getUTCFullYear(),
      calendarMonth: now.getUTCMonth(),
      createdAt: Date.now(),
    });
    await this.showCalendar(ctx, this.deleteStates.get(userId)!, edit);
  }

  @Action('delete:start')
  async onDeleteStart(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const myGroups = await this.getMyGroups(userId);

    if (myGroups.length === 0) {
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

    /* Single group → calendar directly */
    if (myGroups.length === 1) {
      await this.startDeleteForGroup(
        ctx,
        myGroups[0].telegramId,
        myGroups[0].title,
        true,
      );
      return;
    }

    /* Multiple groups → pick one */
    const keyboard = [
      ...myGroups.map((g) => [
        {
          text: '📋 ' + g.title,
          callback_data: 'del:g:' + g.telegramId,
        },
      ]),
      [{ text: t.btnBack, callback_data: 'menu:main' }],
    ];

    try {
      await (ctx as any).editMessageText(t.selectGroup, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch {}
    try {
      await (ctx as any).answerCbQuery();
    } catch {}
  }

  @Action(/^del:g:(.+)$/)
  async onDeleteGroupSelect(@Ctx() ctx: Context): Promise<void> {
    const gid = ((ctx as any).callbackQuery?.data as string).replace(
      'del:g:',
      '',
    );
    const group = await this.groupsService.findByTelegramId(gid);
    if (!group) {
      try {
        await (ctx as any).answerCbQuery(this.t(ctx.from!.id).groupNotFound);
      } catch {}
      return;
    }
    await this.startDeleteForGroup(ctx, group.telegramId, group.title, true);
  }

  /* ═══════ Text Input Handler ═══════════════════════════════════════ */

  private async handleStateInput(
    ctx: Context,
    text: string,
    state: DeleteState,
  ): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);

    /* ─ Protected user add ─ */
    if (state.step === 'awaiting_add_username') {
      const clean = text.trim().replace(/^@/, '');
      if (!clean || clean.length < 2) {
        await ctx.reply(t.badFormat + t.addPrompt, { parse_mode: 'HTML' });
        return;
      }
      this.deleteStates.delete(userId);

      // Resolve telegramUserId from DB if available (M3)
      const knownUser = await this.usersService.findByUsername(clean);
      const resolvedTgId = knownUser?.telegramId;

      const added = await this.adminsService.addProtectedUser(
        String(userId),
        clean,
        resolvedTgId,
      );

      /* FIX: combined message — no double-send */
      const pList = await this.adminsService.getProtectedUsers(String(userId));
      const keyboard: any[][] = [];
      const resultLine = added ? t.addSuccess(clean) : t.addAlready(clean);
      let menuText: string;

      if (pList.length === 0) {
        menuText = resultLine + '\n\n' + t.addEmpty;
      } else {
        menuText =
          resultLine +
          '\n\n' +
          t.addList(pList.map((p, i) => `${i + 1}. @${p.username}`).join('\n'));
        for (const p of pList)
          keyboard.push([
            {
              text: `❌ @${p.username}`,
              callback_data: `prot:rem:${p.username}`,
            },
          ]);
      }
      keyboard.push([{ text: t.btnAddUser, callback_data: 'protected:add' }]);
      keyboard.push([{ text: t.btnBack, callback_data: 'menu:main' }]);

      await ctx.reply(menuText, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
      return;
    }

    /* ─ Access grant username ─ */
    if (state.step === 'awaiting_access_username') {
      const gid = state.accessGroupTelegramId!;
      const clean = text.trim().replace(/^@/, '');
      if (!clean || clean.length < 2) {
        await ctx.reply(t.badFormat + t.accessPrompt, {
          parse_mode: 'HTML',
        });
        return;
      }
      this.deleteStates.delete(userId);

      const targetUser = await this.usersService.findByUsername(clean);
      if (!targetUser) {
        await ctx.reply(t.userNotFound(clean), { parse_mode: 'HTML' });
        return;
      }

      try {
        const member = await this.bot.telegram.getChatMember(
          Number(gid),
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

      const group = await this.groupsService.findByTelegramId(gid);
      if (group) {
        await this.adminsService.saveAdmin(
          group.id,
          targetUser.id,
          targetUser.telegramId,
          false,
        );
        await this.adminsService.grantDeleteAccess(gid, targetUser.telegramId);
      }

      this.groupsCache.delete(Number(targetUser.telegramId));
      await ctx.reply(t.accessGranted(clean, group?.title ?? ''), {
        parse_mode: 'HTML',
      });
      await this.showAccessList(ctx, gid, false);
      return;
    }
  }

  /* ═══════ Delete Execution Engine ══════════════════════════════════ */

  private async executeDelete(
    ctx: Context,
    groupTelegramId: number,
    groupTitle: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<void> {
    const userId = ctx.from!.id;
    const t = this.t(userId);
    const chatId = ctx.chat!.id;

    const progressMsg = await ctx.reply(t.searching(groupTitle), {
      parse_mode: 'HTML',
    });
    const progressId = (progressMsg as any).message_id;

    const edit = async (txt: string, opts?: any) => {
      try {
        await this.bot.telegram.editMessageText(
          chatId,
          progressId,
          undefined,
          txt,
          { parse_mode: 'HTML', ...opts },
        );
      } catch {}
    };

    try {
      /* Build exclude list: owner + bots + protected */
      const excludeIds: number[] = [];
      let ownerNumericId: number | null = null;
      try {
        const admins =
          await this.bot.telegram.getChatAdministrators(groupTelegramId);
        const owner = admins.find((a) => a.status === 'creator');
        if (owner) ownerNumericId = owner.user.id;
        // Exclude ALL bots from deletion (M2)
        for (const a of admins) {
          if (a.user.is_bot) excludeIds.push(a.user.id);
        }
      } catch {}

      const botInfo = await this.bot.telegram.getMe();
      if (!excludeIds.includes(botInfo.id)) excludeIds.push(botInfo.id);
      if (ownerNumericId && !excludeIds.includes(ownerNumericId))
        excludeIds.push(ownerNumericId);

      // Exclude messages sent "on behalf of the group" (anonymous admin)
      // GroupAnonymousBot = 1087968824, Channel bot = 136817688
      const SYSTEM_BOT_IDS = [1087968824, 136817688, 777000];
      for (const sbid of SYSTEM_BOT_IDS) {
        if (!excludeIds.includes(sbid)) excludeIds.push(sbid);
      }
      const absChatId = Math.abs(groupTelegramId);
      if (!excludeIds.includes(absChatId)) excludeIds.push(absChatId);

      try {
        const protectedList = await this.adminsService.getProtectedUsers(
          String(userId),
        );
        for (const p of protectedList) {
          if (p.telegramUserId) {
            excludeIds.push(Number(p.telegramUserId));
          } else {
            // Legacy fallback: resolve by username
            const pUser = await this.usersService.findByUsername(p.username);
            if (pUser) excludeIds.push(Number(pUser.telegramId));
          }
        }
      } catch {}

      const excludeSet = new Set(excludeIds.map(String));
      const r = rangeStr(fromDate, toDate);
      let usedFallback = false;

      /* STRATEGY A: MTProto */
      if (this.mtproto.isReady()) {
        const result = await this.mtproto.fetchAndDeleteByDateRange(
          groupTelegramId,
          fromDate,
          toDate,
          undefined,
          excludeIds,
          async (found, done) => {
            await edit(t.deleting(found) + `\n⬛ ${done}/${found}`);
          },
        );

        if (result.notMember) {
          usedFallback = true;
          await edit(t.notMemberWarning);
          await new Promise((res) => setTimeout(res, 1500));
        } else if (result.notAdmin) {
          usedFallback = true;
          await edit(t.notAdminWarning);
          await new Promise((res) => setTimeout(res, 1500));
        } else if (result.total === 0) {
          await edit(t.notFound(r));
          return;
        } else {
          /* Clean DB records */
          try {
            const dbMsgs = await this.messagesService.getMessagesByDateRange(
              groupTelegramId,
              fromDate,
              toDate,
            );
            const dbIds = dbMsgs
              .filter((m) => !excludeSet.has(String(m.telegramUserId)))
              .map((m) => m.id);
            if (dbIds.length)
              await this.messagesService.deleteMessagesFromDb(dbIds);
          } catch {}

          const resultText =
            t.resultAll(groupTitle, result.deleted, r, this.modeLabel(userId)) +
            (result.failed > 0 ? t.failedSome(result.failed) : '');

          await edit(resultText, {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: t.btnRepeat, callback_data: 'delete:start' },
                  { text: t.btnMain, callback_data: 'menu:main' },
                ],
              ],
            },
          });
          return;
        }
      }

      /* STRATEGY B: Bot API fallback */
      const messages = await this.messagesService.getMessagesByDateRange(
        groupTelegramId,
        fromDate,
        toDate,
      );
      const toDeleteMsgs = messages.filter(
        (m) => !excludeSet.has(String(m.telegramUserId)),
      );

      if (toDeleteMsgs.length === 0) {
        await edit(t.notFound(r));
        return;
      }

      await edit(t.deleting(toDeleteMsgs.length));

      const msgIds = toDeleteMsgs.map((m) => Number(m.telegramMessageId));
      const dbIdMap: Record<number, number> = {};
      for (const m of toDeleteMsgs) dbIdMap[Number(m.telegramMessageId)] = m.id;

      let deleted = 0;
      let failed = 0;
      const BATCH = 100;

      for (let i = 0; i < msgIds.length; i += BATCH) {
        const batch = msgIds.slice(i, i + BATCH);
        try {
          if (typeof (this.bot.telegram as any).deleteMessages === 'function') {
            await (this.bot.telegram as any).deleteMessages(
              groupTelegramId,
              batch,
            );
            deleted += batch.length;
          } else {
            throw new Error('deleteMessages not available');
          }
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
        if (i > 0 && i % 500 === 0)
          await edit(
            t.deleting(toDeleteMsgs.length) +
              `\n⬛ ${i}/${toDeleteMsgs.length}`,
          );
        if (i + BATCH < msgIds.length)
          await new Promise((res) => setTimeout(res, 350));
      }

      /* Clean DB */
      const dbIds = msgIds.map((id) => dbIdMap[id]).filter(Boolean);
      if (dbIds.length) await this.messagesService.deleteMessagesFromDb(dbIds);

      const mode = usedFallback ? t.botApiMode : this.modeLabel(userId);
      const resultText =
        t.resultAll(groupTitle, deleted, r, mode) +
        (failed > 0 ? t.failedSome(failed) : '');

      await edit(resultText, {
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
