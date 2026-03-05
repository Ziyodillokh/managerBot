import { Update, Start, Command, On, Ctx, Action, Next } from 'nestjs-telegraf';
import { UseGuards, Logger, OnModuleInit } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminsService } from '../modules/admins/admins.service';
import { GroupsService } from '../modules/groups/groups.service';
import { UsersService } from '../modules/users/users.service';
import { SettingsService } from '../modules/settings/settings.service';
import { MessagesService } from '../modules/messages/messages.service';

// ─── Inline keyboard builders (static) ─────────────────────────────────────

const MAIN_MENU_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '📋 Komandalar', callback_data: 'menu:commands' },
      { text: "📖 Qo'llanma", callback_data: 'menu:guide' },
    ],
    [
      { text: 'ℹ️ Bot haqida', callback_data: 'menu:about' },
      { text: '🔧 Imkoniyatlar', callback_data: 'menu:features' },
    ],
    [{ text: "➕ Guruhga qo'shish", callback_data: 'menu:addtogroup' }],
  ],
};

const BACK_KEYBOARD = {
  inline_keyboard: [[{ text: '⬅️ Bosh menyu', callback_data: 'menu:main' }]],
};

@Update()
export class TelegramUpdate implements OnModuleInit {
  private readonly logger = new Logger(TelegramUpdate.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly adminsService: AdminsService,
    private readonly groupsService: GroupsService,
    private readonly usersService: UsersService,
    private readonly settingsService: SettingsService,
    private readonly messagesService: MessagesService,
  ) {}

  // ─────────────────── Register bot commands on startup ──────────────────────

  async onModuleInit(): Promise<void> {
    try {
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: '🏠 Bosh menyu' },
        { command: 'reload', description: "🔄 Admin ro'yxatini yangilash" },
        { command: 'settings', description: '⚙️ Bot sozlamalari' },
        { command: 'mute', description: '🔇 Foydalanuvchini mute qilish' },
        { command: 'unmute', description: '🔊 Mute ni olib tashlash' },
        { command: 'delete', description: "🗑️ Xabarlarni o'chirish" },
      ]);

      // Scope: all private chats
      await this.bot.telegram.setMyCommands(
        [{ command: 'start', description: '🏠 Bosh menyu' }],
        { scope: { type: 'all_private_chats' } },
      );

      // Scope: all group chats (admin commands visible)
      await this.bot.telegram.setMyCommands(
        [
          { command: 'reload', description: "🔄 Admin ro'yxatini yangilash" },
          { command: 'settings', description: '⚙️ Bot sozlamalari' },
          { command: 'mute', description: '🔇 Foydalanuvchini mute qilish' },
          { command: 'unmute', description: '🔊 Mute ni olib tashlash' },
          { command: 'delete', description: "🗑️ Xabarlarni o'chirish" },
        ],
        { scope: { type: 'all_group_chats' } },
      );

      this.logger.log('✅ Bot commands registered with Telegram');
    } catch (err) {
      this.logger.error('Failed to register bot commands', err);
    }
  }

  // ──────────────── Menu text helpers ─────────────────────────────

  private mainMenuText(firstName: string): string {
    return (
      `🛡 <b>Guardy Bot</b> ga xush kelibsiz, ${firstName}!\n\n` +
      `Men Telegram guruhlarini boshqarish uchun mo'ljallangan professional botman.\n\n` +
      `📌 <b>Quyidagi bo'limlarni ko'rish uchun tugmalardan foydalaning:</b>`
    );
  }

  private commandsText(): string {
    return (
      `📋 <b>Komandalar ro'yxati</b>\n\n` +
      `👮 <b>Administratorlar uchun:</b>\n\n` +
      `🔄 /reload\n` +
      `┗ Guruh adminlari ro'yxatini yangilaydi\n\n` +
      `⚙️ /settings\n` +
      `┗ Bot sozlamalarini boshqarish menyusi\n\n` +
      `🔇 /mute @username\n` +
      `┗ Foydalanuvchini faqat o'qish rejimiga o'tkazadi\n\n` +
      `🔊 /unmute @username\n` +
      `┗ Foydalanuvchidan mute cheklovini olib tashlaydi\n\n` +
      `🗑️ /delete message -from <code>YYYY-MM-DD</code> -to <code>YYYY-MM-DD</code>\n` +
      `┗ Sana oralig'idagi barcha xabarlarni o'chiradi\n\n` +
      `🗑️ /delete message -from <code>YYYY-MM-DD</code> -to <code>YYYY-MM-DD</code> by @username\n` +
      `┗ Bitta foydalanuvchining xabarlarini o'chiradi\n\n` +
      `💡 <i>Barcha komandalar faqat guruhda ishlaydi</i>`
    );
  }

  private guideText(): string {
    return (
      `📖 <b>Qo'llanma — Botni sozlash</b>\n\n` +
      `<b>1️⃣ Botni guruhga qo'shing</b>\n` +
      `• Guruh sozlamalaridan "Add member" orqali @guardybot ni qo'shing\n\n` +
      `<b>2️⃣ Bot ga admin huquqi bering</b>\n` +
      `Zaruriy huquqlar:\n` +
      `✅ Delete messages\n` +
      `✅ Restrict members\n` +
      `✅ Manage chat\n\n` +
      `<b>3️⃣ Admin ro'yxatini yuklang</b>\n` +
      `• Guruhda /reload buyrug'ini yuboring\n\n` +
      `<b>4️⃣ Sozlamalarni moslashtiring</b>\n` +
      `• /settings orqali kerakli funksiyalarni yoqing\n\n` +
      `<b>5️⃣ Foydalanishni boshlang</b>\n` +
      `• /mute, /unmute, /delete — tayyor! 🎉`
    );
  }

  private featuresText(): string {
    return (
      `🔧 <b>Bot imkoniyatlari</b>\n\n` +
      `👮 <b>Moderatsiya</b>\n` +
      `• Foydalanuvchini mute qilish / bekor qilish\n` +
      `• Sana oralig'ida xabarlarni ommaviy o'chirish\n` +
      `• Muayyan foydalanuvchi xabarlarini filtrlash\n\n` +
      `⚙️ <b>Sozlamalar panel</b>\n` +
      `• Inline keyboard orqali funksiyalarni toggle qilish\n` +
      `• Mute, Delete, Welcome, Anti-Spam, Anti-Flood\n\n` +
      `👥 <b>Admin boshqaruvi</b>\n` +
      `• Admin ro'yxatini avtomatik yuklash\n` +
      `• Huquqlarni real vaqtda sinxronlash\n\n` +
      `🗄️ <b>Ma'lumotlar bazasi</b>\n` +
      `• Barcha xabarlar PostgreSQL da saqlanadi\n` +
      `• Guruh, foydalanuvchi, sozlamalar tarixi\n\n` +
      `🛡️ <b>Himoya</b>\n` +
      `• Faqat admin buyruq bera oladi\n` +
      `• Har bir so'rov tekshiriladi`
    );
  }

  private addToGroupText(): string {
    return (
      `➕ <b>Botni guruhga qo'shish</b>\n\n` +
      `Quyidagi tugmani bosib botni to'g'ridan-to'g'ri guruhingizga qo'shishingiz mumkin.\n\n` +
      `<b>Eslatma:</b> Bot qo'shilgandan so'ng unga quyidagi admin huquqlarini bering:\n\n` +
      `✅ <code>Delete messages</code>\n` +
      `✅ <code>Restrict members</code>\n` +
      `✅ <code>Manage chat</code>\n\n` +
      `Keyin guruhda <b>/reload</b> buyrug'ini yuboring.`
    );
  }

  private async ensureGroupAndUser(ctx: Context): Promise<void> {
    const chat = ctx.chat;
    const from = ctx.from;
    if (!chat || !from) return;

    if (chat.type !== 'private') {
      const title = (chat as any).title ?? 'Unknown';
      const username = (chat as any).username;
      await this.groupsService.findOrCreate(
        chat.id,
        title,
        chat.type,
        username,
      );
    }

    await this.usersService.findOrCreate(
      from.id,
      from.first_name,
      from.last_name,
      from.username,
    );
  }

  private async ensureAdminsLoaded(ctx: Context): Promise<void> {
    const chat = ctx.chat;
    if (!chat || chat.type === 'private') return;
    const admins = await this.adminsService.getGroupAdmins(chat.id);
    if (admins.length === 0) {
      await this.adminsService.reloadAdmins(chat.id);
    }
  }

  private parseUsername(raw: string): string {
    return raw.startsWith('@') ? raw.slice(1) : raw;
  }

  private async resolveTargetUserId(
    ctx: Context,
    raw: string,
  ): Promise<string | null> {
    const username = this.parseUsername(raw);
    // Check if the message is a reply - use replied-to user
    if ((ctx.message as any)?.reply_to_message) {
      return String((ctx.message as any).reply_to_message.from.id);
    }
    // Otherwise look up by username in our DB
    const user = await this.usersService.findByUsername(username);
    if (user) return user.telegramId;
    return null;
  }

  // ─────────────────────── Bot added to group ──────────────────────

  @On('my_chat_member')
  async onMyChatMember(@Ctx() ctx: Context): Promise<void> {
    const update = (ctx.update as any).my_chat_member;
    if (!update) return;
    const chat = update.chat;
    const newStatus = update.new_chat_member?.status;

    if (
      ['member', 'administrator'].includes(newStatus) &&
      chat.type !== 'private'
    ) {
      const group = await this.groupsService.findOrCreate(
        chat.id,
        chat.title,
        chat.type,
        chat.username,
      );
      await this.adminsService.reloadAdmins(chat.id);
      this.logger.log(`Bot added to group: ${chat.title} (${chat.id})`);
    }
  }

  // ────────────────── Track all messages for delete ────────────────

  @On('message')
  async onMessage(
    @Ctx() ctx: Context,
    @Next() next: () => Promise<void>,
  ): Promise<void> {
    try {
      const msg = ctx.message as any;
      if (!msg || !ctx.from) return next();

      // Always register the user
      await this.usersService.findOrCreate(
        ctx.from.id,
        ctx.from.first_name,
        ctx.from.last_name,
        ctx.from.username,
      );

      // Skip commands — they have their own @Start / @Command handlers
      // CRITICAL: call next() so Telegraf continues the middleware chain
      const text: string = msg.text ?? '';
      if (text.startsWith('/')) return next();

      // Group-only: save message to DB for later bulk-delete
      if (ctx.chat && ctx.chat.type !== 'private') {
        const title = (ctx.chat as any).title ?? 'Unknown';
        const chatUsername = (ctx.chat as any).username;
        await this.groupsService.findOrCreate(
          ctx.chat.id,
          title,
          ctx.chat.type,
          chatUsername,
        );
        await this.ensureAdminsLoaded(ctx);

        const sentAt = new Date(msg.date * 1000);
        await this.messagesService.saveMessage(
          msg.message_id,
          ctx.chat.id,
          ctx.from.id,
          ctx.from.first_name,
          sentAt,
          text || undefined,
          ctx.from.username,
          ctx.from.last_name,
        );
      }
    } catch (err) {
      this.logger.error('onMessage error', err);
    }
    // Always continue chain
    return next();
  }

  // ─────────────────────────── /start ─────────────────────────────

  @Start()
  async onStart(@Ctx() ctx: Context): Promise<void> {
    try {
      // Register user regardless of chat type
      if (ctx.from) {
        await this.usersService.findOrCreate(
          ctx.from.id,
          ctx.from.first_name,
          ctx.from.last_name,
          ctx.from.username,
        );
      }

      // If in group - also register group
      if (ctx.chat && ctx.chat.type !== 'private') {
        const title = (ctx.chat as any).title ?? 'Unknown';
        const username = (ctx.chat as any).username;
        await this.groupsService.findOrCreate(
          ctx.chat.id,
          title,
          ctx.chat.type,
          username,
        );
        await ctx.reply(
          `✅ Bot guruhga ulandi! Admin ro'yxatini yuklash uchun /reload buyrug'ini yuboring.`,
        );
        return;
      }

      const firstName = ctx.from?.first_name ?? 'Foydalanuvchi';
      await ctx.reply(this.mainMenuText(firstName), {
        parse_mode: 'HTML',
        reply_markup: MAIN_MENU_KEYBOARD,
      });
    } catch (err) {
      this.logger.error('onStart error', err);
      await ctx.reply('👋 Salom! Botga xush kelibsiz.').catch(() => {});
    }
  }

  // ───────────────────── Menu navigation actions ───────────────────

  @Action('menu:main')
  async onMenuMain(@Ctx() ctx: Context): Promise<void> {
    const firstName = ctx.from?.first_name ?? 'Foydalanuvchi';
    await ctx.editMessageText(this.mainMenuText(firstName), {
      parse_mode: 'HTML',
      reply_markup: MAIN_MENU_KEYBOARD,
    });
    await ctx.answerCbQuery();
  }

  @Action('menu:commands')
  async onMenuCommands(@Ctx() ctx: Context): Promise<void> {
    await ctx.editMessageText(this.commandsText(), {
      parse_mode: 'HTML',
      reply_markup: BACK_KEYBOARD,
    });
    await ctx.answerCbQuery();
  }

  @Action('menu:guide')
  async onMenuGuide(@Ctx() ctx: Context): Promise<void> {
    await ctx.editMessageText(this.guideText(), {
      parse_mode: 'HTML',
      reply_markup: BACK_KEYBOARD,
    });
    await ctx.answerCbQuery();
  }

  @Action('menu:features')
  async onMenuFeatures(@Ctx() ctx: Context): Promise<void> {
    await ctx.editMessageText(this.featuresText(), {
      parse_mode: 'HTML',
      reply_markup: BACK_KEYBOARD,
    });
    await ctx.answerCbQuery();
  }

  @Action('menu:addtogroup')
  async onMenuAddToGroup(@Ctx() ctx: Context): Promise<void> {
    const botInfo = await this.bot.telegram.getMe();
    const botUsername = botInfo.username;
    await ctx.editMessageText(this.addToGroupText(), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "➕ Guruhga qo'shish",
              url: `https://t.me/${botUsername}?startgroup=true`,
            },
          ],
          [{ text: '⬅️ Bosh menyu', callback_data: 'menu:main' }],
        ],
      },
    });
    await ctx.answerCbQuery();
  }

  // ─────────────────────────── /reload ────────────────────────────

  @Command('reload')
  @UseGuards(AdminGuard)
  @AdminOnly()
  async onReload(@Ctx() ctx: Context): Promise<void> {
    const chat = ctx.chat!;
    const loadingMsg = await ctx.reply("🔄 Admin ro'yxati yangilanmoqda...");

    try {
      const admins = await this.adminsService.reloadAdmins(chat.id);
      const adminLines = admins.map((a) => {
        const name = a.user?.username
          ? `@${a.user.username}`
          : `${a.user?.firstName ?? 'Unknown'}`;
        const roleTag = a.isOwner ? ' 👑' : '';
        return `• ${name}${roleTag}`;
      });

      await ctx.telegram.editMessageText(
        chat.id,
        (loadingMsg as any).message_id,
        undefined,
        `✅ Admin ro'yxati yangilandi!\n\n👮 <b>Adminlar (${admins.length}):</b>\n${adminLines.join('\n')}`,
        { parse_mode: 'HTML' },
      );
    } catch (err) {
      this.logger.error('reload error', err);
      await ctx.reply("❌ Xatolik yuz berdi. Urinib ko'ring.");
    }
  }

  // ─────────────────────────── /settings ──────────────────────────

  @Command('settings')
  @UseGuards(AdminGuard)
  @AdminOnly()
  async onSettings(@Ctx() ctx: Context): Promise<void> {
    const chat = ctx.chat!;
    await this.settingsService.getOrCreate(chat.id);
    const settings = await this.settingsService.get(chat.id);
    if (!settings) return;

    await ctx.reply(
      `⚙️ <b>Bot sozlamalari</b>\n\nToggle qilish uchun tugmalarni bosing:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: this.buildSettingsKeyboard(settings),
        },
      },
    );
  }

  private buildSettingsKeyboard(settings: any) {
    const on = '✅';
    const off = '❌';
    return [
      [
        {
          text: `${settings.muteEnabled ? on : off} Mute`,
          callback_data: 'settings:muteEnabled',
        },
        {
          text: `${settings.deleteEnabled ? on : off} Delete`,
          callback_data: 'settings:deleteEnabled',
        },
      ],
      [
        {
          text: `${settings.welcomeEnabled ? on : off} Welcome`,
          callback_data: 'settings:welcomeEnabled',
        },
        {
          text: `${settings.antiSpamEnabled ? on : off} Anti-Spam`,
          callback_data: 'settings:antiSpamEnabled',
        },
      ],
      [
        {
          text: `${settings.antiFloodEnabled ? on : off} Anti-Flood`,
          callback_data: 'settings:antiFloodEnabled',
        },
      ],
    ];
  }

  @Action(/^settings:(.+)$/)
  @UseGuards(AdminGuard)
  @AdminOnly()
  async onSettingsAction(@Ctx() ctx: Context): Promise<void> {
    const chat = ctx.chat!;
    const cbData = (ctx as any).callbackQuery?.data as string;
    const key = cbData.split(':')[1] as any;

    const settings = await this.settingsService.toggle(chat.id, key);

    await ctx.editMessageReplyMarkup({
      inline_keyboard: this.buildSettingsKeyboard(settings),
    });
    await ctx.answerCbQuery("✅ Sozlama o'zgartirildi!");
  }

  // ─────────────────────────── /mute ──────────────────────────────

  @Command('mute')
  @UseGuards(AdminGuard)
  @AdminOnly()
  async onMute(@Ctx() ctx: Context): Promise<void> {
    const chat = ctx.chat!;
    const msg = ctx.message as any;
    const text: string = msg?.text ?? '';
    const parts = text.trim().split(/\s+/);

    // Support reply-based mute or @username
    let targetTelegramId: string | null = null;
    let displayName = '';

    if (msg.reply_to_message) {
      const targetUser = msg.reply_to_message.from;
      targetTelegramId = String(targetUser.id);
      displayName = targetUser.username
        ? `@${targetUser.username}`
        : targetUser.first_name;
    } else if (parts[1]) {
      targetTelegramId = await this.resolveTargetUserId(ctx, parts[1]);
      displayName = parts[1];
    }

    if (!targetTelegramId) {
      await ctx.reply(
        '❓ Foydalanish: /mute @username yoki xabarga reply qilib /mute',
      );
      return;
    }

    try {
      await ctx.telegram.restrictChatMember(chat.id, Number(targetTelegramId), {
        permissions: {
          can_send_messages: false,
          can_send_audios: false,
          can_send_documents: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_video_notes: false,
          can_send_voice_notes: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
        },
      });
      await ctx.reply(
        `🔇 ${displayName} foydalanuvchisi mute qilindi.\n` +
          `Endi u xabar yozolmaydi.`,
      );
    } catch (err: any) {
      this.logger.error('mute error', err);
      if (err?.description?.includes('not enough rights')) {
        await ctx.reply("❌ Botda foydalanuvchini cheklash huquqi yo'q.");
      } else if (err?.description?.includes('PARTICIPANT_ID_INVALID')) {
        await ctx.reply(
          '❌ Foydalanuvchi topilmadi. Avval guruhda xabar yozishi kerak.',
        );
      } else {
        await ctx.reply('❌ Mute qilishda xatolik yuz berdi.');
      }
    }
  }

  // ─────────────────────────── /unmute ────────────────────────────

  @Command('unmute')
  @UseGuards(AdminGuard)
  @AdminOnly()
  async onUnmute(@Ctx() ctx: Context): Promise<void> {
    const chat = ctx.chat!;
    const msg = ctx.message as any;
    const text: string = msg?.text ?? '';
    const parts = text.trim().split(/\s+/);

    let targetTelegramId: string | null = null;
    let displayName = '';

    if (msg.reply_to_message) {
      const targetUser = msg.reply_to_message.from;
      targetTelegramId = String(targetUser.id);
      displayName = targetUser.username
        ? `@${targetUser.username}`
        : targetUser.first_name;
    } else if (parts[1]) {
      targetTelegramId = await this.resolveTargetUserId(ctx, parts[1]);
      displayName = parts[1];
    }

    if (!targetTelegramId) {
      await ctx.reply(
        '❓ Foydalanish: /unmute @username yoki xabarga reply qilib /unmute',
      );
      return;
    }

    try {
      await ctx.telegram.restrictChatMember(chat.id, Number(targetTelegramId), {
        permissions: {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_change_info: false,
          can_invite_users: true,
          can_pin_messages: false,
        },
      });
      await ctx.reply(
        `🔊 ${displayName} foydalanuvchisidan cheklov olib tashlandi.\n` +
          `Endi u guruhda xabar yozishi mumkin.`,
      );
    } catch (err: any) {
      this.logger.error('unmute error', err);
      if (err?.description?.includes('not enough rights')) {
        await ctx.reply(
          "❌ Botda foydalanuvchini cheklashni bekor qilish huquqi yo'q.",
        );
      } else if (err?.description?.includes('PARTICIPANT_ID_INVALID')) {
        await ctx.reply('❌ Foydalanuvchi topilmadi.');
      } else {
        await ctx.reply('❌ Unmute qilishda xatolik yuz berdi.');
      }
    }
  }

  // ──────────────── /delete message -from DATE -to DATE ────────────

  @Command('delete')
  @UseGuards(AdminGuard)
  @AdminOnly()
  async onDelete(@Ctx() ctx: Context): Promise<void> {
    const chat = ctx.chat!;
    const msg = ctx.message as any;
    const text: string = msg?.text ?? '';

    // Parse: /delete message -from 2026-01-01 -to 2026-02-01 [by @username]
    const pattern =
      /^\/delete\s+message\s+-from\s+(\d{4}-\d{2}-\d{2})\s+-to\s+(\d{4}-\d{2}-\d{2})(?:\s+by\s+(@?\w+))?/i;
    const match = text.match(pattern);

    if (!match) {
      await ctx.reply(
        `❓ <b>To'g'ri foydalanish:</b>\n\n` +
          `<code>/delete message -from YYYY-MM-DD -to YYYY-MM-DD</code>\n` +
          `<code>/delete message -from YYYY-MM-DD -to YYYY-MM-DD by @username</code>\n\n` +
          `<b>Misol:</b>\n` +
          `<code>/delete message -from 2026-01-01 -to 2026-02-01</code>\n` +
          `<code>/delete message -from 2026-01-01 -to 2026-02-01 by @john</code>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const fromDate = new Date(`${match[1]}T00:00:00.000Z`);
    const toDate = new Date(`${match[2]}T23:59:59.999Z`);
    const byUsername = match[3] ?? null;

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      await ctx.reply(
        "❌ Noto'g'ri sana formati. YYYY-MM-DD ko'rinishida yozing.",
      );
      return;
    }

    if (fromDate > toDate) {
      await ctx.reply('❌ "from" sanasi "to" sanasidan oldin bo\'lishi kerak.');
      return;
    }

    let targetTelegramId: string | undefined;
    if (byUsername) {
      const user = await this.usersService.findByUsername(byUsername);
      if (!user) {
        await ctx.reply(
          `❌ @${this.parseUsername(byUsername)} foydalanuvchisi topilmadi.\n` +
            `Foydalanuvchi guruhda xabar yozgan bo\'lishi kerak.`,
        );
        return;
      }
      targetTelegramId = user.telegramId;
    }

    const progressMsg = await ctx.reply('🔍 Xabarlar qidirilmoqda...');

    try {
      const messages = await this.messagesService.getMessagesByDateRange(
        chat.id,
        fromDate,
        toDate,
        targetTelegramId,
      );

      if (messages.length === 0) {
        await ctx.telegram.editMessageText(
          chat.id,
          (progressMsg as any).message_id,
          undefined,
          byUsername
            ? `ℹ️ ${byUsername} foydalanuvchisining ko'rsatilgan davrdagi xabarlari topilmadi.`
            : `ℹ️ Ko'rsatilgan davrdagi xabarlar topilmadi.`,
        );
        return;
      }

      await ctx.telegram.editMessageText(
        chat.id,
        (progressMsg as any).message_id,
        undefined,
        `🗑️ ${messages.length} ta xabar o'chirilmoqda...`,
      );

      // Delete in batches to avoid Telegram rate limits
      let deleted = 0;
      let failed = 0;
      const dbIds: number[] = [];
      const BATCH_SIZE = 100;

      // Use deleteMessages for supergroups (100 at a time)
      const messageIds = messages.map((m) => Number(m.telegramMessageId));
      const dbIdsMap: Record<number, number> = {};
      for (const m of messages) {
        dbIdsMap[Number(m.telegramMessageId)] = m.id;
      }

      for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
        const batch = messageIds.slice(i, i + BATCH_SIZE);
        try {
          await ctx.telegram.deleteMessages(chat.id, batch);
          deleted += batch.length;
          dbIds.push(...batch.map((tid) => dbIdsMap[tid]).filter(Boolean));
        } catch (batchErr: any) {
          // Fallback: try deleting one by one
          for (const tid of batch) {
            try {
              await ctx.telegram.deleteMessage(chat.id, tid);
              deleted++;
              if (dbIdsMap[tid]) dbIds.push(dbIdsMap[tid]);
            } catch {
              failed++;
            }
          }
        }
        // Rate-limit friendly delay
        if (i + BATCH_SIZE < messageIds.length) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      // Remove from DB
      if (dbIds.length) {
        await this.messagesService.deleteMessagesFromDb(dbIds);
      }

      const summary = byUsername
        ? `🗑️ ${byUsername} foydalanuvchisining <b>${deleted}</b> ta xabari o'chirildi.${failed ? `\n⚠️ ${failed} ta xabar o'chirilmadi (eskirgan bo'lishi mumkin).` : ''}`
        : `🗑️ <b>${deleted}</b> ta xabar o'chirildi.${failed ? `\n⚠️ ${failed} ta xabar o'chirilmadi (eskirgan bo'lishi mumkin).` : ''}`;

      await ctx.telegram.editMessageText(
        chat.id,
        (progressMsg as any).message_id,
        undefined,
        summary,
        { parse_mode: 'HTML' },
      );
    } catch (err) {
      this.logger.error('delete error', err);
      await ctx.reply("❌ Xabarlarni o'chirishda xatolik yuz berdi.");
    }
  }
}
