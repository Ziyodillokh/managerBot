import { Update, Start, On, Ctx, Action, Next } from 'nestjs-telegraf';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { GroupsService } from '../modules/groups/groups.service';
import { UsersService } from '../modules/users/users.service';
import { MessagesService } from '../modules/messages/messages.service';

// ─── Bot egasining Telegram ID si ───────────────────────────────────────────
const MASTER_ID = '2527188';

// ─── Conversation state for delete flow ─────────────────────────────────────
interface DeleteState {
  step: 'awaiting_date' | 'awaiting_user_date';
  groupTelegramId: number;
  groupTitle: string;
}

@Update()
export class TelegramUpdate implements OnModuleInit {
  private readonly logger = new Logger(TelegramUpdate.name);

  /** In-memory delete flow state per user */
  private readonly deleteStates = new Map<number, DeleteState>();

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly groupsService: GroupsService,
    private readonly usersService: UsersService,
    private readonly messagesService: MessagesService,
  ) {}

  // ─────────────────────── Bot commands registration ───────────────────────

  async onModuleInit(): Promise<void> {
    try {
      // Private chat: only /start
      await this.bot.telegram.setMyCommands(
        [{ command: 'start', description: '🏠 Bosh menyu' }],
        { scope: { type: 'all_private_chats' } },
      );
      // Groups: NO commands visible
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

  // ─────────────────── Bot guruhga qoshildi / chiqarildi ─────────────────────

  @On('my_chat_member')
  async onMyChatMember(@Ctx() ctx: Context): Promise<void> {
    const update = (ctx.update as any).my_chat_member;
    if (!update) return;

    const chat = update.chat;
    const from = update.from;
    const newStatus = update.new_chat_member?.status;

    if (chat.type === 'private') return;

    // Bot removed from group
    if (['left', 'kicked'].includes(newStatus)) {
      await this.groupsService.deactivate(chat.id);
      this.logger.log(`Bot removed from group: ${chat.title} (${chat.id})`);
      return;
    }

    if (!['member', 'administrator'].includes(newStatus)) return;

    // Only MASTER can add the bot
    if (String(from.id) !== MASTER_ID) {
      this.logger.warn(`Non-master (${from.id}) tried to add bot to ${chat.title}`);
      try { await ctx.telegram.leaveChat(chat.id); } catch {}
      return;
    }

    // Verify master is the OWNER (creator) of this group
    try {
      const member = await ctx.telegram.getChatMember(chat.id, Number(MASTER_ID));
      if (member.status !== 'creator') {
        await ctx.telegram.sendMessage(
          Number(MASTER_ID),
          `⚠️ <b>${chat.title}</b> guruhiga qoshildim.\n\n` +
            `Lekin siz bu guruhning <b>egasi (creator)</b> emassiz.\n` +
            `Bot faqat siz ega bolgan guruhlarda ishlaydi.\n\n` +
            `Guruhdan chiqyapman.`,
          { parse_mode: 'HTML' },
        );
        await ctx.telegram.leaveChat(chat.id);
        return;
      }
    } catch (err) {
      this.logger.error(`getChatMember error in group ${chat.id}`, err);
    }

    // Check bot has admin rights
    try {
      const botInfo = await this.bot.telegram.getMe();
      const botMember = await ctx.telegram.getChatMember(chat.id, botInfo.id);
      if (botMember.status !== 'administrator') {
        await ctx.telegram.sendMessage(
          Number(MASTER_ID),
          `⚠️ <b>${chat.title}</b> guruhiga qoshildim.\n\n` +
            `Lekin menga <b>admin huquqlari</b> berilmagan.\n` +
            `Xabarlarni ochirish uchun meni admin qiling:\n` +
            `✅ Delete messages huquqini bering.`,
          { parse_mode: 'HTML' },
        );
      }
    } catch {}

    // Save group to DB
    await this.groupsService.findOrCreate(chat.id, chat.title, chat.type, chat.username);
    await this.usersService.findOrCreate(from.id, from.first_name, from.last_name, from.username);

    this.logger.log(`Bot added to group: ${chat.title} (${chat.id})`);

    try {
      await ctx.telegram.sendMessage(
        Number(MASTER_ID),
        `✅ <b>${chat.title}</b> guruhiga qoshildi!\n\n` +
          `Endi /start orqali xabarlarni boshqarishingiz mumkin.`,
        { parse_mode: 'HTML' },
      );
    } catch {}
  }

  // ──────────────────── Barcha xabarlarni kuzatish ─────────────────────────

  @On('message')
  async onMessage(
    @Ctx() ctx: Context,
    @Next() next: () => Promise<void>,
  ): Promise<void> {
    try {
      const msg = ctx.message as any;
      if (!msg || !ctx.from) return next();

      const text: string = msg.text ?? '';
      const isMaster = String(ctx.from.id) === MASTER_ID;

      // Private chat: handle delete flow state machine
      if (ctx.chat?.type === 'private') {
        if (isMaster && !text.startsWith('/')) {
          const state = this.deleteStates.get(ctx.from.id);
          if (state) {
            await this.handleDeleteInput(ctx, text, state);
            return;
          }
        }
        return next();
      }

      // Group: skip commands, save messages to DB
      if (text.startsWith('/')) return next();

      const from = ctx.from;

      await this.usersService.findOrCreate(from.id, from.first_name, from.last_name, from.username);

      const title = (ctx.chat as any).title ?? 'Unknown';
      const chatUsername = (ctx.chat as any).username;
      await this.groupsService.findOrCreate(ctx.chat!.id, title, ctx.chat!.type, chatUsername);

      const sentAt = new Date(msg.date * 1000);
      await this.messagesService.saveMessage(
        msg.message_id,
        ctx.chat!.id,
        from.id,
        from.first_name,
        sentAt,
        text || undefined,
        from.username,
        from.last_name,
      );
    } catch (err) {
      this.logger.error('onMessage error', err);
    }
    return next();
  }

  // ─────────────────────────── /start ─────────────────────────────────────

  @Start()
  async onStart(@Ctx() ctx: Context): Promise<void> {
    try {
      if (ctx.chat?.type !== 'private') return;

      if (String(ctx.from?.id) !== MASTER_ID) {
        await ctx.reply('❌ Bu bot shaxsiy foydalanish uchun moljallangan.');
        return;
      }

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

  // ─────────────────────── Bosh menyu ──────────────────────────────────────

  private async sendMainMenu(ctx: Context, edit: boolean): Promise<void> {
    const groups = await this.groupsService.getActiveGroups();
    const botInfo = await this.bot.telegram.getMe();

    let text: string;
    let keyboard: any[][];

    if (groups.length === 0) {
      text =
        `🛡 <b>Guardy Bot</b>\n\n` +
        `Hozircha hech qanday guruh qoshilmagan.\n\n` +
        `Bot faqat siz <b>ega (creator)</b> bolgan guruhlarda ishlaydi.\n` +
        `Botni guruhga qoshing va admin huquqlarini bering:`;
      keyboard = [
        [{ text: "➕ Guruhga qoshish", url: `https://t.me/${botInfo.username}?startgroup=true` }],
      ];
    } else {
      const groupList = groups.map((g) => `• ${g.title}`).join('\n');
      text =
        `🛡 <b>Guardy Bot</b>\n\n` +
        `📋 Faol guruhlar: <b>${groups.length} ta</b>\n\n` +
        `${groupList}\n\n` +
        `Xabarlarni ochirish uchun quyidagi tugmani bosing:`;
      keyboard = [
        [{ text: "🗑️ Xabarlarni ochirish", callback_data: 'delete:start' }],
        [{ text: "➕ Yangi guruh qoshish", url: `https://t.me/${botInfo.username}?startgroup=true` }],
      ];
    }

    const opts: any = { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } };

    if (edit) {
      await (ctx as any).editMessageText(text, opts);
      await (ctx as any).answerCbQuery();
    } else {
      await ctx.reply(text, opts);
    }
  }

  @Action('menu:main')
  async onMenuMain(@Ctx() ctx: Context): Promise<void> {
    if (String(ctx.from?.id) !== MASTER_ID) {
      await (ctx as any).answerCbQuery('❌');
      return;
    }
    if (ctx.from) this.deleteStates.delete(ctx.from.id);
    await this.sendMainMenu(ctx, true);
  }

  // ─────────────────────── Delete: guruh tanlash ───────────────────────────

  @Action('delete:start')
  async onDeleteStart(@Ctx() ctx: Context): Promise<void> {
    if (String(ctx.from?.id) !== MASTER_ID) {
      await (ctx as any).answerCbQuery("❌ Ruxsat yoq");
      return;
    }

    const groups = await this.groupsService.getActiveGroups();

    if (groups.length === 0) {
      await (ctx as any).editMessageText("❌ Faol guruhlar yoq. Avval botni guruhga qoshing.");
      await (ctx as any).answerCbQuery();
      return;
    }

    if (groups.length === 1) {
      await this.showGroupDeleteMenu(ctx, groups[0].telegramId, groups[0].title);
      return;
    }

    const keyboard = [
      ...groups.map((g) => [{ text: `📋 ${g.title}`, callback_data: `delete:group:${g.telegramId}` }]),
      [{ text: '⬅️ Orqaga', callback_data: 'menu:main' }],
    ];

    await (ctx as any).editMessageText(
      '📋 <b>Guruhni tanlang:</b>\n\nQaysi guruh xabarlarini ochirmoqchisiz?',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } },
    );
    await (ctx as any).answerCbQuery();
  }

  @Action(/^delete:group:(.+)$/)
  async onDeleteGroupSelect(@Ctx() ctx: Context): Promise<void> {
    if (String(ctx.from?.id) !== MASTER_ID) { await (ctx as any).answerCbQuery('❌'); return; }
    const cbData = (ctx as any).callbackQuery?.data as string;
    const groupTelegramId = cbData.replace('delete:group:', '');
    const group = await this.groupsService.findByTelegramId(groupTelegramId);
    if (!group) { await (ctx as any).answerCbQuery('❌ Guruh topilmadi'); return; }
    await this.showGroupDeleteMenu(ctx, group.telegramId, group.title);
  }

  // ─────────────────────── Delete: tur tanlash ─────────────────────────────

  private async showGroupDeleteMenu(
    ctx: Context,
    groupTelegramId: string,
    groupTitle: string,
  ): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [{ text: "🗓 Sanadan-sanagacha (hamma)", callback_data: `delete:all:${groupTelegramId}` }],
        [{ text: '👤 Bitta foydalanuvchi xabarlari', callback_data: `delete:user:${groupTelegramId}` }],
        [{ text: '⬅️ Orqaga', callback_data: 'delete:start' }],
      ],
    };

    await (ctx as any).editMessageText(
      `🗑️ <b>${groupTitle}</b>\n\nQanday xabarlarni ochirmoqchisiz?`,
      { parse_mode: 'HTML', reply_markup: keyboard },
    );
    await (ctx as any).answerCbQuery();
  }

  // ─────────────────── Delete: sana kiritish (hamma) ───────────────────────

  @Action(/^delete:all:(.+)$/)
  async onDeleteAllPrompt(@Ctx() ctx: Context): Promise<void> {
    if (String(ctx.from?.id) !== MASTER_ID) { await (ctx as any).answerCbQuery('❌'); return; }
    const cbData = (ctx as any).callbackQuery?.data as string;
    const groupTelegramId = cbData.replace('delete:all:', '');
    const group = await this.groupsService.findByTelegramId(groupTelegramId);

    this.deleteStates.set(ctx.from!.id, {
      step: 'awaiting_date',
      groupTelegramId: Number(groupTelegramId),
      groupTitle: group?.title ?? 'Guruh',
    });

    await (ctx as any).editMessageText(
      `🗓 <b>${group?.title ?? 'Guruh'} — sana oraligini kiriting</b>\n\n` +
        `Format: <code>YYYY-MM-DD YYYY-MM-DD</code>\n\n` +
        `<b>Misol:</b> <code>2026-01-01 2026-03-05</code>\n\n` +
        `⚠️ <i>Guruh egasi va botlar xabarlari ochilmaydi.\n` +
        `Oddiy adminlar va barcha boshqa foydalanuvchilar xabarlari ochiriladi.</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'delete:cancel' }]] },
      },
    );
    await (ctx as any).answerCbQuery();
  }

  // ─────────────── Delete: sana + username kiritish ────────────────────────

  @Action(/^delete:user:(.+)$/)
  async onDeleteUserPrompt(@Ctx() ctx: Context): Promise<void> {
    if (String(ctx.from?.id) !== MASTER_ID) { await (ctx as any).answerCbQuery('❌'); return; }
    const cbData = (ctx as any).callbackQuery?.data as string;
    const groupTelegramId = cbData.replace('delete:user:', '');
    const group = await this.groupsService.findByTelegramId(groupTelegramId);

    this.deleteStates.set(ctx.from!.id, {
      step: 'awaiting_user_date',
      groupTelegramId: Number(groupTelegramId),
      groupTitle: group?.title ?? 'Guruh',
    });

    await (ctx as any).editMessageText(
      `👤 <b>${group?.title ?? 'Guruh'} — bitta foydalanuvchi xabarlari</b>\n\n` +
        `Format: <code>@username YYYY-MM-DD YYYY-MM-DD</code>\n\n` +
        `<b>Misol:</b> <code>@john 2026-01-01 2026-03-05</code>\n\n` +
        `⚠️ <i>Guruh egasining xabarlari hech qachon ochilmaydi.</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'delete:cancel' }]] },
      },
    );
    await (ctx as any).answerCbQuery();
  }

  // ─────────────────────── Delete: bekor qilish ────────────────────────────

  @Action('delete:cancel')
  async onDeleteCancel(@Ctx() ctx: Context): Promise<void> {
    if (ctx.from) this.deleteStates.delete(ctx.from.id);
    await (ctx as any).editMessageText('❌ Bekor qilindi.');
    await (ctx as any).answerCbQuery();
  }

  // ────────────── Matn kiritish — delete flow handler ─────────────────────

  private async handleDeleteInput(
    ctx: Context,
    text: string,
    state: DeleteState,
  ): Promise<void> {
    const userId = ctx.from!.id;

    if (state.step === 'awaiting_date') {
      const match = text.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})$/);
      if (!match) {
        await ctx.reply(
          "❌ Format notogri.\n\nMisol: <code>2026-01-01 2026-03-05</code>",
          { parse_mode: 'HTML' },
        );
        return;
      }
      const fromDate = new Date(`${match[1]}T00:00:00.000Z`);
      const toDate = new Date(`${match[2]}T23:59:59.999Z`);
      if (fromDate > toDate) {
        await ctx.reply("❌ Boshlanish sanasi tugash sanasidan oldin bolishi kerak.");
        return;
      }
      this.deleteStates.delete(userId);
      await this.executeDelete(ctx, state.groupTelegramId, state.groupTitle, fromDate, toDate, null);
      return;
    }

    if (state.step === 'awaiting_user_date') {
      const match = text.trim().match(/^(@?\w+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})$/);
      if (!match) {
        await ctx.reply(
          "❌ Format notogri.\n\nMisol: <code>@john 2026-01-01 2026-03-05</code>",
          { parse_mode: 'HTML' },
        );
        return;
      }
      const fromDate = new Date(`${match[2]}T00:00:00.000Z`);
      const toDate = new Date(`${match[3]}T23:59:59.999Z`);
      if (fromDate > toDate) {
        await ctx.reply("❌ Boshlanish sanasi tugash sanasidan oldin bolishi kerak.");
        return;
      }
      this.deleteStates.delete(userId);
      await this.executeDelete(ctx, state.groupTelegramId, state.groupTitle, fromDate, toDate, match[1]);
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
      `🔍 <b>${groupTitle}</b>\n\nXabarlar qidirilmoqda...`,
      { parse_mode: 'HTML' },
    );

    try {
      // Get group OWNER id from Telegram (exclude their messages)
      let ownerTelegramId: string | null = null;
      try {
        const admins = await this.bot.telegram.getChatAdministrators(groupTelegramId);
        const owner = admins.find((a) => a.status === 'creator');
        if (owner) ownerTelegramId = String(owner.user.id);
      } catch (err) {
        this.logger.warn(`Could not get admins for group ${groupTelegramId}`, err);
      }

      // Resolve username to telegramUserId
      let targetTelegramId: string | undefined;
      if (username) {
        const uname = username.startsWith('@') ? username.slice(1) : username;
        const user = await this.usersService.findByUsername(uname);
        if (!user) {
          await this.bot.telegram.editMessageText(
            ctx.chat!.id,
            (progressMsg as any).message_id,
            undefined,
            `❌ @${uname} foydalanuvchisi topilmadi.\n\nFoydalanuvchi guruhda xabar yozgan bolishi kerak.`,
          );
          return;
        }
        targetTelegramId = user.telegramId;

        // Cannot delete owner messages even by username
        if (ownerTelegramId && targetTelegramId === ownerTelegramId) {
          await this.bot.telegram.editMessageText(
            ctx.chat!.id,
            (progressMsg as any).message_id,
            undefined,
            `⛔ Guruh egasining xabarlarini ochirish mumkin emas.`,
          );
          return;
        }
      }

      // Fetch messages from DB
      const messages = await this.messagesService.getMessagesByDateRange(
        groupTelegramId,
        fromDate,
        toDate,
        targetTelegramId,
      );

      // Filter: exclude owner messages
      const toDeleteMessages = messages.filter((m) => {
        if (ownerTelegramId && String(m.telegramUserId) === ownerTelegramId) return false;
        return true;
      });

      if (toDeleteMessages.length === 0) {
        const rangeStr = `${fromDate.toISOString().slice(0, 10)} — ${toDate.toISOString().slice(0, 10)}`;
        await this.bot.telegram.editMessageText(
          ctx.chat!.id,
          (progressMsg as any).message_id,
          undefined,
          username
            ? `ℹ️ ${username} foydalanuvchisining <b>${rangeStr}</b> oraliqdagi xabarlari topilmadi.`
            : `ℹ️ <b>${rangeStr}</b> oraliqdagi xabarlar topilmadi.`,
          { parse_mode: 'HTML' },
        );
        return;
      }

      await this.bot.telegram.editMessageText(
        ctx.chat!.id,
        (progressMsg as any).message_id,
        undefined,
        `🗑️ <b>${toDeleteMessages.length}</b> ta xabar ochirilmoqda...\n<i>Iltimos kuting.</i>`,
        { parse_mode: 'HTML' },
      );

      // Delete in batches of 100
      let deleted = 0;
      let failed = 0;
      const dbIds: number[] = [];
      const dbIdsMap: Record<number, number> = {};
      for (const m of toDeleteMessages) dbIdsMap[Number(m.telegramMessageId)] = m.id;

      const messageIds = toDeleteMessages.map((m) => Number(m.telegramMessageId));
      const BATCH_SIZE = 100;

      for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
        const batch = messageIds.slice(i, i + BATCH_SIZE);
        try {
          await this.bot.telegram.deleteMessages(groupTelegramId, batch);
          deleted += batch.length;
          dbIds.push(...batch.map((tid) => dbIdsMap[tid]).filter(Boolean));
        } catch {
          for (const tid of batch) {
            try {
              await this.bot.telegram.deleteMessage(groupTelegramId, tid);
              deleted++;
              if (dbIdsMap[tid]) dbIds.push(dbIdsMap[tid]);
            } catch { failed++; }
          }
        }
        if (i + BATCH_SIZE < messageIds.length) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (dbIds.length) await this.messagesService.deleteMessagesFromDb(dbIds);

      const rangeStr = `${fromDate.toISOString().slice(0, 10)} — ${toDate.toISOString().slice(0, 10)}`;
      const summary = username
        ? `✅ <b>${groupTitle}</b>\n\n${username} foydalanuvchisining <b>${deleted}</b> ta xabari ochirildi.\n📅 Davr: ${rangeStr}` +
          (failed ? `\n⚠️ ${failed} ta xabar ochirilmadi.` : '')
        : `✅ <b>${groupTitle}</b>\n\n<b>${deleted}</b> ta xabar ochirildi.\n📅 Davr: ${rangeStr}` +
          (failed ? `\n⚠️ ${failed} ta xabar ochirilmadi.` : '');

      await this.bot.telegram.editMessageText(
        ctx.chat!.id,
        (progressMsg as any).message_id,
        undefined,
        summary,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🔄 Yana ochirish", callback_data: 'delete:start' },
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
