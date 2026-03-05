import { Update, Start, On, Ctx, Action, Next } from 'nestjs-telegraf';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { GroupsService } from '../modules/groups/groups.service';
import { UsersService } from '../modules/users/users.service';
import { MessagesService } from '../modules/messages/messages.service';
import { MtprotoService } from './mtproto.service';

// ─── Delete conversation state ────────────────────────────────────────────────
interface DeleteState {
  step: 'awaiting_date' | 'awaiting_user_date';
  groupTelegramId: number;
  groupTitle: string;
}

@Update()
export class TelegramUpdate implements OnModuleInit {
  private readonly logger = new Logger(TelegramUpdate.name);
  private readonly deleteStates = new Map<number, DeleteState>();

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly groupsService: GroupsService,
    private readonly usersService: UsersService,
    private readonly messagesService: MessagesService,
    private readonly mtproto: MtprotoService,
  ) {}

  // ─────────────────────────── Bot commands ──────────────────────────────────

  async onModuleInit(): Promise<void> {
    try {
      await this.bot.telegram.setMyCommands(
        [{ command: 'start', description: '🏠 Bosh menyu' }],
        { scope: { type: 'all_private_chats' } },
      );
      await this.bot.telegram.setMyCommands(
        [],
        { scope: { type: 'all_group_chats' } },
      );
      await this.bot.telegram.setMyCommands([]);
      this.logger.log('✅ Bot commands registered with Telegram');
    } catch (err) {
      this.logger.error('Failed to register bot commands', err);
    }
  }

  // ──────────────────── Bot guruhga qoshildi / chiqarildi ─────────────────────

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
      this.logger.log(`Bot removed from: ${chat.title}`);
      return;
    }

    if (!['member', 'administrator'].includes(newStatus)) return;

    // Adder must be the OWNER (creator) of this group
    try {
      const member = await ctx.telegram.getChatMember(chat.id, from.id);
      if (member.status !== 'creator') {
        this.logger.warn(`Non-owner ${from.id} tried to add bot to ${chat.title}`);
        try {
          await ctx.telegram.sendMessage(
            from.id,
            '<b>❌ Xato!</b>\n\nSiz <b>' + chat.title + '</b> guruhining egasi emassiz.\n\nBot faqat siz ega bolgan guruhlarda ishlaydi. Guruhdan chiqyapman.',
            { parse_mode: 'HTML' },
          );
        } catch {}
        try { await ctx.telegram.leaveChat(chat.id); } catch {}
        return;
      }
    } catch (err) {
      this.logger.error('getChatMember error', err);
    }

    // Check bot has admin rights
    try {
      const botInfo = await this.bot.telegram.getMe();
      const botMember = await ctx.telegram.getChatMember(chat.id, botInfo.id);
      if (botMember.status !== 'administrator') {
        try {
          await ctx.telegram.sendMessage(
            from.id,
            '<b>⚠️ ' + chat.title + '</b>\n\nBot guruhga qoshildi lekin <b>admin huquqi</b> berilmagan.\n\n✅ Delete messages huquqini bering, keyin ishlaydi.',
            { parse_mode: 'HTML' },
          );
        } catch {}
      }
    } catch {}

    await this.groupsService.findOrCreate(chat.id, chat.title, chat.type, chat.username);
    await this.usersService.findOrCreate(from.id, from.first_name, from.last_name, from.username);

    this.logger.log(`Bot added to group: ${chat.title} (${chat.id})`);

    try {
      await ctx.telegram.sendMessage(
        from.id,
        '✅ <b>' + chat.title + '</b> guruhiga muvaffaqiyatli qoshildim!\n\nEndi /start buyrug\'i orqali xabarlarni boshqarishingiz mumkin.',
        { parse_mode: 'HTML' },
      );
    } catch {}
  }

  // ────────────────── Barcha xabarlarni kuzatish (group) ───────────────────

  @On('message')
  async onMessage(
    @Ctx() ctx: Context,
    @Next() next: () => Promise<void>,
  ): Promise<void> {
    try {
      const msg = ctx.message as any;
      if (!msg || !ctx.from) return next();

      const text: string = msg.text ?? '';

      // Private chat: handle delete flow input
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

      // Group: skip commands
      if (text.startsWith('/')) return next();

      // Save user
      await this.usersService.findOrCreate(
        ctx.from.id,
        ctx.from.first_name,
        ctx.from.last_name,
        ctx.from.username,
      );

      // Save group
      const title = (ctx.chat as any).title ?? 'Unknown';
      const chatUsername = (ctx.chat as any).username;
      await this.groupsService.findOrCreate(ctx.chat!.id, title, ctx.chat!.type, chatUsername);

      // Save message for future bulk-delete
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

  // ──────────────────────────── /start ─────────────────────────────────────

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

      await this.sendMainMenu(ctx, false);
    } catch (err) {
      this.logger.error('onStart error', err);
    }
  }

  // ─────────────────────────── Bosh menyu ──────────────────────────────────

  private async getMyGroups(userId: number): Promise<Array<{ telegramId: string; title: string }>> {
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
    const botInfo = await this.bot.telegram.getMe();
    const addUrl = 'https://t.me/' + botInfo.username + '?startgroup=true';
    const userId = ctx.from!.id;

    const myGroups = await this.getMyGroups(userId);

    let text: string;
    let keyboard: any[][];

    const mtprotoStatus = this.mtproto.isReady()
      ? '🟢 MTProto: Faol (har qanday muddatdagi xabar)'
      : '🟡 Bot API: Faqat 48 soat ichidagi xabarlar';

    if (myGroups.length === 0) {
      text =
        '🛡 <b>Guardy Bot</b>\n\n' +
        mtprotoStatus + '\n\n' +
        'Hozircha siz ega bolgan guruh yoq.\n\n' +
        'Botni guruhga qoshing (siz o\'sha guruhning egasi / creator bolishingiz kerak) va admin huquqlarini bering:';
      keyboard = [
        [{ text: "➕ Guruhga qo'shish", url: addUrl }],
        [{ text: '❓ Yordam', callback_data: 'help' }],
      ];
    } else {
      const groupList = myGroups.map((g) => '• ' + g.title).join('\n');
      text =
        '🛡 <b>Guardy Bot</b>\n\n' +
        mtprotoStatus + '\n\n' +
        '📋 Sizning guruhlaringiz (' + myGroups.length + ' ta):\n' + groupList + '\n\n' +
        'Xabarlarni ochirish uchun quyidagi tugmani bosing:';
      keyboard = [
        [{ text: "🗑️ Xabarlarni o'chirish", callback_data: 'delete:start' }],
        [{ text: "➕ Yangi guruh qo'shish", url: addUrl }],
        [{ text: '❓ Yordam', callback_data: 'help' }],
      ];
    }

    const opts: any = { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } };

    if (edit) {
      try {
        await (ctx as any).editMessageText(text, opts);
      } catch {}
      try { await (ctx as any).answerCbQuery(); } catch {}
    } else {
      await ctx.reply(text, opts);
    }
  }

  @Action('menu:main')
  async onMenuMain(@Ctx() ctx: Context): Promise<void> {
    if (ctx.from) this.deleteStates.delete(ctx.from.id);
    await this.sendMainMenu(ctx, true);
  }

  // ─────────────────────── Yordam ──────────────────────────────────────────

  @Action('help')
  async onHelp(@Ctx() ctx: Context): Promise<void> {
    const text =
      '❓ <b>Yordam</b>\n\n' +
      '<b>1. Botni guruhga qoshing</b>\n' +
      '   • "➕ Guruhga qoshish" tugmasini bosing\n' +
      '   • Faqat siz <b>ega (creator)</b> bolgan guruhlar ishlaydi\n\n' +
      '<b>2. Botga admin huquqi bering</b>\n' +
      '   ✅ Delete messages\n\n' +
      '<b>3. Xabarlarni turing:</b>\n' +
      '   • Barcha xabarlar (sana oraligida)\n' +
      '   • Bitta foydalanuvchi xabarlari\n\n' +
      '<b>❗ Eslatma:</b>\n' +
      '   Guruh egasi (creator) va botlar xabarlari hech qachon ochilmaydi.';

    await (ctx as any).editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '⬅️ Orqaga', callback_data: 'menu:main' }]] },
    });
    await (ctx as any).answerCbQuery();
  }

  // ─────────────────────── Delete: guruh tanlash ───────────────────────────

  @Action('delete:start')
  async onDeleteStart(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const myGroups = await this.getMyGroups(userId);

    if (myGroups.length === 0) {
      await (ctx as any).editMessageText(
        '❌ Siz ega bolgan va botni qoshgan guruh yoq.\n\nAvval "➕ Guruhga qoshish" tugmasini bosing.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Orqaga', callback_data: 'menu:main' }]],
          },
        },
      );
      await (ctx as any).answerCbQuery();
      return;
    }

    if (myGroups.length === 1) {
      await this.showGroupDeleteMenu(ctx, Number(myGroups[0].telegramId), myGroups[0].title);
      return;
    }

    // Multiple groups
    const keyboard = [
      ...myGroups.map((g) => [{ text: '📋 ' + g.title, callback_data: 'del:g:' + g.telegramId }]),
      [{ text: '⬅️ Orqaga', callback_data: 'menu:main' }],
    ];

    await (ctx as any).editMessageText(
      '📋 <b>Guruhni tanlang:</b>',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } },
    );
    await (ctx as any).answerCbQuery();
  }

  @Action(/^del:g:(.+)$/)
  async onDeleteGroupSelect(@Ctx() ctx: Context): Promise<void> {
    const cbData = (ctx as any).callbackQuery?.data as string;
    const groupTelegramId = cbData.replace('del:g:', '');
    const group = await this.groupsService.findByTelegramId(groupTelegramId);
    if (!group) { await (ctx as any).answerCbQuery('Guruh topilmadi'); return; }
    await this.showGroupDeleteMenu(ctx, Number(group.telegramId), group.title);
  }

  // ─────────────────────── Delete: tur tanlash ─────────────────────────────

  private async showGroupDeleteMenu(
    ctx: Context,
    groupTelegramId: number,
    groupTitle: string,
  ): Promise<void> {
    await (ctx as any).editMessageText(
      '🗑️ <b>' + groupTitle + '</b>\n\nQanday xabarlarni ochirmoqchisiz?',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: "🗓 Sanadan-sanagacha (hammaning xabarlari)", callback_data: 'del:all:' + groupTelegramId }],
            [{ text: '👤 Bitta foydalanuvchi xabarlari', callback_data: 'del:user:' + groupTelegramId }],
            [{ text: '⬅️ Orqaga', callback_data: 'delete:start' }],
          ],
        },
      },
    );
    await (ctx as any).answerCbQuery();
  }

  // ─────────────────── Delete: sana kiritish (hamma) ───────────────────────

  @Action(/^del:all:(.+)$/)
  async onDeleteAllPrompt(@Ctx() ctx: Context): Promise<void> {
    const cbData = (ctx as any).callbackQuery?.data as string;
    const groupTelegramId = cbData.replace('del:all:', '');
    const group = await this.groupsService.findByTelegramId(groupTelegramId);

    this.deleteStates.set(ctx.from!.id, {
      step: 'awaiting_date',
      groupTelegramId: Number(groupTelegramId),
      groupTitle: group?.title ?? 'Guruh',
    });

    const hint = this.mtproto.isReady()
      ? '✅ MTProto: Har qanday muddatdagi xabarlar ochiriladi.'
      : '⚠️ Bot API: Faqat 48 soat ichidagi xabarlar ochiriladi (MTProto ulash uchun TELEGRAM_API_ID qoshing).';

    await (ctx as any).editMessageText(
      '🗓 <b>' + (group?.title ?? 'Guruh') + ' — sana oraligini kiriting</b>\n\n' +
      'Format: <code>YYYY-MM-DD YYYY-MM-DD</code>\n' +
      'Misol: <code>2026-01-01 2026-03-05</code>\n\n' +
      hint + '\n\n' +
      '⛔ <i>Guruh egasi va botlar xabarlari hech qachon ochilmaydi.</i>',
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'del:cancel' }]] },
      },
    );
    await (ctx as any).answerCbQuery();
  }

  // ─────────────── Delete: sana + username kiritish ────────────────────────

  @Action(/^del:user:(.+)$/)
  async onDeleteUserPrompt(@Ctx() ctx: Context): Promise<void> {
    const cbData = (ctx as any).callbackQuery?.data as string;
    const groupTelegramId = cbData.replace('del:user:', '');
    const group = await this.groupsService.findByTelegramId(groupTelegramId);

    this.deleteStates.set(ctx.from!.id, {
      step: 'awaiting_user_date',
      groupTelegramId: Number(groupTelegramId),
      groupTitle: group?.title ?? 'Guruh',
    });

    const hint = this.mtproto.isReady()
      ? '✅ MTProto: Har qanday muddatdagi xabarlar ochiriladi.'
      : '⚠️ Bot API: Faqat 48 soat ichidagi xabarlar ochiriladi.';

    await (ctx as any).editMessageText(
      '👤 <b>' + (group?.title ?? 'Guruh') + ' — bitta foydalanuvchi xabarlari</b>\n\n' +
      'Format: <code>@username YYYY-MM-DD YYYY-MM-DD</code>\n' +
      'Misol: <code>@john 2026-01-01 2026-03-05</code>\n\n' +
      hint + '\n\n' +
      '⛔ <i>Guruh egasining xabarlari hech qachon ochilmaydi.</i>',
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'del:cancel' }]] },
      },
    );
    await (ctx as any).answerCbQuery();
  }

  @Action('del:cancel')
  async onDeleteCancel(@Ctx() ctx: Context): Promise<void> {
    if (ctx.from) this.deleteStates.delete(ctx.from.id);
    await (ctx as any).editMessageText('❌ Bekor qilindi.');
    try { await (ctx as any).answerCbQuery(); } catch {}
    setTimeout(async () => { try { await this.sendMainMenu(ctx, true); } catch {} }, 1500);
  }

  // ────────────── Matn kiritish — delete flow ──────────────────────────────

  private async handleDeleteInput(
    ctx: Context,
    text: string,
    state: DeleteState,
  ): Promise<void> {
    const userId = ctx.from!.id;

    if (state.step === 'awaiting_date') {
      const match = text.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})$/);
      if (!match) {
        await ctx.reply('❌ Format notogri.\n\nMisol: <code>2026-01-01 2026-03-05</code>', { parse_mode: 'HTML' });
        return;
      }
      const from = new Date(match[1] + 'T00:00:00.000Z');
      const to = new Date(match[2] + 'T23:59:59.999Z');
      if (from > to) { await ctx.reply('❌ Boshlanish sanasi tugash sanasidan oldin bolishi kerak.'); return; }
      this.deleteStates.delete(userId);
      await this.executeDelete(ctx, state.groupTelegramId, state.groupTitle, from, to, null);
      return;
    }

    if (state.step === 'awaiting_user_date') {
      const match = text.trim().match(/^(@?\w+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})$/);
      if (!match) {
        await ctx.reply('❌ Format notogri.\n\nMisol: <code>@john 2026-01-01 2026-03-05</code>', { parse_mode: 'HTML' });
        return;
      }
      const from = new Date(match[2] + 'T00:00:00.000Z');
      const to = new Date(match[3] + 'T23:59:59.999Z');
      if (from > to) { await ctx.reply('❌ Boshlanish sanasi tugash sanasidan oldin bolishi kerak.'); return; }
      this.deleteStates.delete(userId);
      await this.executeDelete(ctx, state.groupTelegramId, state.groupTitle, from, to, match[1]);
    }
  }

  // ─────────────────────── Xabarlarni ochirish ────────────────────────────

  private async executeDelete(
    ctx: Context,
    groupTelegramId: number,
    groupTitle: string,
    fromDate: Date,
    toDate: Date,
    username: string | null,
  ): Promise<void> {
    const progressMsg = await ctx.reply(
      '🔍 <b>' + groupTitle + '</b>\n\nXabarlar qidirilmoqda...',
      { parse_mode: 'HTML' },
    );
    const chatId = ctx.chat!.id;
    const progressId = (progressMsg as any).message_id;

    try {
      // Get group OWNER to exclude their messages
      let ownerTelegramId: string | null = null;
      try {
        const admins = await this.bot.telegram.getChatAdministrators(groupTelegramId);
        const owner = admins.find((a) => a.status === 'creator');
        if (owner) ownerTelegramId = String(owner.user.id);
      } catch {}

      // Resolve username
      let targetTelegramId: string | undefined;
      if (username) {
        const uname = username.startsWith('@') ? username.slice(1) : username;
        const user = await this.usersService.findByUsername(uname);
        if (!user) {
          await this.bot.telegram.editMessageText(chatId, progressId, undefined,
            '❌ @' + uname + ' foydalanuvchisi topilmadi.\n\nFoydalanuvchi guruhda xabar yozgan bolishi kerak.');
          return;
        }
        targetTelegramId = user.telegramId;
        if (ownerTelegramId && targetTelegramId === ownerTelegramId) {
          await this.bot.telegram.editMessageText(chatId, progressId, undefined,
            '⛔ Guruh egasining xabarlarini ochirish mumkin emas.');
          return;
        }
      }

      // Get messages from DB
      const messages = await this.messagesService.getMessagesByDateRange(
        groupTelegramId, fromDate, toDate, targetTelegramId,
      );

      // Exclude owner messages
      const toDelete = messages.filter(
        (m) => !(ownerTelegramId && String(m.telegramUserId) === ownerTelegramId),
      );

      if (toDelete.length === 0) {
        const range = fromDate.toISOString().slice(0, 10) + ' — ' + toDate.toISOString().slice(0, 10);
        await this.bot.telegram.editMessageText(chatId, progressId, undefined,
          username
            ? 'ℹ️ ' + username + ' foydalanuvchisining <b>' + range + '</b> oraliqdagi xabarlari topilmadi.'
            : 'ℹ️ <b>' + range + '</b> oraliqdagi ochiriladigan xabarlar topilmadi.',
          { parse_mode: 'HTML' });
        return;
      }

      await this.bot.telegram.editMessageText(chatId, progressId, undefined,
        '🗑️ <b>' + toDelete.length + '</b> ta xabar ochirilmoqda...\n<i>Iltimos kuting.</i>',
        { parse_mode: 'HTML' });

      const messageIds = toDelete.map((m) => Number(m.telegramMessageId));
      const dbIdsMap: Record<number, number> = {};
      for (const m of toDelete) dbIdsMap[Number(m.telegramMessageId)] = m.id;

      let deleted = 0;
      let failed = 0;

      // ─── MTProto (no 48h limit) ────────────────────────────────────
      if (this.mtproto.isReady()) {
        const result = await this.mtproto.deleteMessages(groupTelegramId, messageIds);
        deleted = result.deleted;
        failed = result.failed;
      } else {
        // ─── Bot API fallback (48h limit) ──────────────────────────
        const BATCH = 100;
        for (let i = 0; i < messageIds.length; i += BATCH) {
          const batch = messageIds.slice(i, i + BATCH);
          try {
            await this.bot.telegram.deleteMessages(groupTelegramId, batch);
            deleted += batch.length;
          } catch {
            for (const id of batch) {
              try { await this.bot.telegram.deleteMessage(groupTelegramId, id); deleted++; }
              catch { failed++; }
            }
          }
          if (i + BATCH < messageIds.length) await new Promise((r) => setTimeout(r, 500));
        }
      }

      // Clean DB
      const deletedDbIds = messageIds.slice(0, deleted).map((id) => dbIdsMap[id]).filter(Boolean);
      if (deletedDbIds.length) await this.messagesService.deleteMessagesFromDb(deletedDbIds);

      const range = fromDate.toISOString().slice(0, 10) + ' — ' + toDate.toISOString().slice(0, 10);
      const mode = this.mtproto.isReady() ? '🟢 MTProto' : '🟡 Bot API';
      const summary = username
        ? '✅ <b>' + groupTitle + '</b>\n\n' + username + ' foydalanuvchisining <b>' + deleted + '</b> ta xabari ochirildi.\n📅 ' + range + '\n' + mode
        : '✅ <b>' + groupTitle + '</b>\n\n<b>' + deleted + '</b> ta xabar ochirildi.\n📅 ' + range + '\n' + mode;

      await this.bot.telegram.editMessageText(chatId, progressId, undefined,
        summary + (failed ? '\n⚠️ ' + failed + ' ta xabar ochirilmadi (eski yoki mavjud emas).' : ''),
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🔄 Yana o'chirish", callback_data: 'delete:start' },
                { text: '🏠 Bosh menyu', callback_data: 'menu:main' },
              ],
            ],
          },
        },
      );
    } catch (err) {
      this.logger.error('executeDelete error', err);
      try { await ctx.reply("❌ Xabarlarni ochirishda xatolik yuz berdi."); } catch {}
    }
  }
}