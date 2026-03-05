export type Lang = 'uz' | 'ru' | 'en';

export const LANG_LABELS: Record<Lang, string> = {
  uz: "🇺🇿 O'zbek",
  ru: '🇷🇺 Русский',
  en: '🇬🇧 English',
};

// ─── Translation dictionary ─────────────────────────────────────────────────

export type TranslationKey = keyof typeof T.uz;

export const T = {
  uz: {
    // Lang
    langSelect: '🌐 <b>Tilni tanlang</b>\n\nChoose language / Выберите язык:',
    langChanged: "✅ Til o'zgartirildi: 🇺🇿 O'zbek",
    langBtn: '🌐 Til',
    // MTProto status
    mtOn: '🟢 MTProto: Faol (cheksiz muddat)',
    mtOff: '🟡 Bot API: Faqat so\'nggi 48 soat',
    // Main menu
    menuNoGroups: (status: string) =>
      `🛡 <b>Guardy Bot</b>\n\n${status}\n\nHozircha siz ega bo'lgan faol guruh yo'q.\n\nBotni guruhga qo'shing (siz o'sha guruhning <b>egasi (creator)</b> bo'lishingiz kerak) va admin huquqlarini bering:`,
    menuHasGroups: (status: string, count: number, list: string) =>
      `🛡 <b>Guardy Bot</b>\n\n${status}\n\n📋 Sizning guruhlaringiz (${count} ta):\n${list}\n\nXabarlarni o'chirish uchun pastdagi tugmani bosing:`,
    // Buttons
    btnAddGroup: "➕ Guruhga qo'shish",
    btnDelete: "🗑️ Xabarlarni o'chirish",
    btnAddNew: "➕ Yangi guruh qo'shish",
    btnHelp: '❓ Yordam',
    btnBack: '⬅️ Orqaga',
    btnCancel: '❌ Bekor qilish',
    btnMain: '🏠 Bosh menyu',
    btnRepeat: "🔄 Yana o'chirish",
    // Help
    helpText:
      '❓ <b>Yordam</b>\n\n' +
      '<b>1. Botni guruhga qo\'shing</b>\n' +
      '   • "➕ Guruhga qo\'shish" tugmasini bosing\n' +
      '   • Faqat siz <b>ega (creator)</b> bo\'lgan guruhlar ishlaydi\n\n' +
      '<b>2. Botga admin huquqi bering</b>\n' +
      '   ✅ "Delete messages" huquqi kerak\n\n' +
      '<b>3. Xabar o\'chirish turlari:</b>\n' +
      '   🗓 Sana oraligida — barcha foydalanuvchilar\n' +
      '   👤 Bitta foydalanuvchi xabarlari\n\n' +
      '<b>❗ Eslatma:</b>\n' +
      '   Guruh egasi va botlar xabarlari <b>hech qachon</b> o\'chirilmaydi.',
    // Delete flow
    selectGroup: '📋 <b>Guruhni tanlang:</b>',
    noGroups: '❌ Siz ega bo\'lgan va bot qo\'shilgan guruh yo\'q.\n\nAvval "➕ Guruhga qo\'shish" tugmasini bosing.',
    deleteType: (group: string) => `🗑️ <b>${group}</b>\n\nQanday xabarlarni o'chirmoqchisiz?`,
    btnAllMsgs: '🗓 Sana oraligida (hammaning xabarlari)',
    btnUserMsgs: '👤 Bitta foydalanuvchi xabarlari',
    inputAllDate: (group: string, hint: string) =>
      `🗓 <b>${group} — sana oraligini kiriting</b>\n\nFormat: <code>YYYY-MM-DD YYYY-MM-DD</code>\nMisol: <code>2026-01-01 2026-03-05</code>\n\n${hint}\n\n⛔ <i>Guruh egasi va botlar xabarlari hech qachon o'chirilmaydi.</i>`,
    inputUserDate: (group: string, hint: string) =>
      `👤 <b>${group} — foydalanuvchi xabarlari</b>\n\nFormat: <code>@username YYYY-MM-DD YYYY-MM-DD</code>\nMisol: <code>@john 2026-01-01 2026-03-05</code>\n\n${hint}\n\n⛔ <i>Guruh egasining xabarlari hech qachon o'chirilmaydi.</i>`,
    mtHintOn: '✅ MTProto: Har qanday muddatdagi xabarlar o\'chiriladi.',
    mtHintOff: '⚠️ Bot API: Faqat oxirgi 48 soatdagi xabarlar (muddatsiz rejim uchun TELEGRAM_SESSION qo\'shing).',
    cancelled: '❌ Bekor qilindi.',
    searching: (group: string) => `🔍 <b>${group}</b>\n\nXabarlar qidirilmoqda...`,
    deleting: (count: number) => `🗑️ <b>${count}</b> ta xabar o'chirilmoqda...\n<i>Iltimos kuting.</i>`,
    notFound: (range: string) => `ℹ️ <b>${range}</b> oraliqdagi o'chiriladigan xabarlar topilmadi.`,
    notFoundUser: (username: string, range: string) => `ℹ️ ${username} foydalanuvchisining <b>${range}</b> oraliqdagi xabarlari topilmadi.`,
    userNotFound: (uname: string) => `❌ @${uname} foydalanuvchisi topilmadi.\n\nFoydalanuvchi guruhda xabar yozgan bo'lishi kerak.`,
    ownerProtected: '⛔ Guruh egasining xabarlarini o\'chirish mumkin emas.',
    resultAll: (group: string, deleted: number, range: string, mode: string) =>
      `✅ <b>${group}</b>\n\n<b>${deleted}</b> ta xabar o'chirildi.\n📅 ${range}\n${mode}`,
    resultUser: (group: string, username: string, deleted: number, range: string, mode: string) =>
      `✅ <b>${group}</b>\n\n${username} — <b>${deleted}</b> ta xabar o'chirildi.\n📅 ${range}\n${mode}`,
    failedSome: (n: number) => `\n⚠️ ${n} ta xabar o'chirilmadi (allaqachon o'chirilgan yoki eski).`,
    groupNotFound: '❌ Guruh topilmadi.',
    error: '❌ Xatolik yuz berdi. Qayta urinib ko\'ring.',
    badDateFormat: 'Misol: <code>2026-01-01 2026-03-05</code>',
    badUserDateFormat: 'Misol: <code>@john 2026-01-01 2026-03-05</code>',
    dateOrderError: '❌ Boshlanish sanasi tugash sanasidan oldin bo\'lishi kerak.',
    badFormat: '❌ Format noto\'g\'ri.\n\n',
    notOwner: (title: string) =>
      `<b>❌ Xato!</b>\n\nSiz <b>${title}</b> guruhining egasi emassiz.\n\nBot faqat siz ega bo'lgan guruhlarda ishlaydi. Guruhdan chiqyapman.`,
    noAdminRights: (title: string) =>
      `<b>⚠️ ${title}</b>\n\nBot guruhga qo'shildi lekin <b>admin huquqi</b> berilmagan.\n\n✅ "Delete messages" huquqini bering, keyin ishlaydi.`,
    addedToGroup: (title: string) =>
      `✅ <b>${title}</b> guruhiga muvaffaqiyatli qo'shildim!\n\nEndi /start buyrug'i orqali xabarlarni boshqarishingiz mumkin.`,
    mtMode: '🟢 MTProto (cheksiz)',
    botApiMode: '🟡 Bot API (48s)',
  },

  ru: {
    langSelect: '🌐 <b>Выберите язык</b>\n\nChoose language / Tilni tanlang:',
    langChanged: '✅ Язык изменён: 🇷🇺 Русский',
    langBtn: '🌐 Язык',
    mtOn: '🟢 MTProto: Активен (без ограничений)',
    mtOff: '🟡 Bot API: Только последние 48 часов',
    menuNoGroups: (status: string) =>
      `🛡 <b>Guardy Bot</b>\n\n${status}\n\nУ вас нет активных групп.\n\nДобавьте бота в группу (вы должны быть <b>создателем (creator)</b>) и дайте права администратора:`,
    menuHasGroups: (status: string, count: number, list: string) =>
      `🛡 <b>Guardy Bot</b>\n\n${status}\n\n📋 Ваши группы (${count}):\n${list}\n\nНажмите кнопку ниже для удаления сообщений:`,
    btnAddGroup: '➕ Добавить в группу',
    btnDelete: '🗑️ Удалить сообщения',
    btnAddNew: '➕ Добавить новую группу',
    btnHelp: '❓ Помощь',
    btnBack: '⬅️ Назад',
    btnCancel: '❌ Отмена',
    btnMain: '🏠 Главное меню',
    btnRepeat: '🔄 Удалить ещё',
    helpText:
      '❓ <b>Помощь</b>\n\n' +
      '<b>1. Добавьте бота в группу</b>\n' +
      '   • Нажмите "➕ Добавить в группу"\n' +
      '   • Работает только в группах, где вы <b>создатель (creator)</b>\n\n' +
      '<b>2. Дайте боту права администратора</b>\n' +
      '   ✅ "Удаление сообщений"\n\n' +
      '<b>3. Режимы удаления:</b>\n' +
      '   🗓 По диапазону дат — все пользователи\n' +
      '   👤 Сообщения одного пользователя\n\n' +
      '<b>❗ Важно:</b>\n' +
      '   Сообщения создателя группы и ботов <b>никогда</b> не удаляются.',
    selectGroup: '📋 <b>Выберите группу:</b>',
    noGroups: '❌ Нет групп, где вы создатель и добавлен бот.\n\nНажмите "➕ Добавить в группу".',
    deleteType: (group: string) => `🗑️ <b>${group}</b>\n\nКакие сообщения удалить?`,
    btnAllMsgs: '🗓 По диапазону дат (все пользователи)',
    btnUserMsgs: '👤 Сообщения одного пользователя',
    inputAllDate: (group: string, hint: string) =>
      `🗓 <b>${group} — введите диапазон дат</b>\n\nФормат: <code>YYYY-MM-DD YYYY-MM-DD</code>\nПример: <code>2026-01-01 2026-03-05</code>\n\n${hint}\n\n⛔ <i>Сообщения создателя и ботов никогда не удаляются.</i>`,
    inputUserDate: (group: string, hint: string) =>
      `👤 <b>${group} — сообщения пользователя</b>\n\nФормат: <code>@username YYYY-MM-DD YYYY-MM-DD</code>\nПример: <code>@john 2026-01-01 2026-03-05</code>\n\n${hint}\n\n⛔ <i>Сообщения создателя группы не удаляются.</i>`,
    mtHintOn: '✅ MTProto: Удаляет сообщения любой давности.',
    mtHintOff: '⚠️ Bot API: Только последние 48 ч (добавьте TELEGRAM_SESSION для снятия ограничений).',
    cancelled: '❌ Отменено.',
    searching: (group: string) => `🔍 <b>${group}</b>\n\nПоиск сообщений...`,
    deleting: (count: number) => `🗑️ Удаляется <b>${count}</b> сообщений...\n<i>Пожалуйста, подождите.</i>`,
    notFound: (range: string) => `ℹ️ Нет сообщений для удаления за <b>${range}</b>.`,
    notFoundUser: (username: string, range: string) => `ℹ️ Сообщений от ${username} за <b>${range}</b> не найдено.`,
    userNotFound: (uname: string) => `❌ Пользователь @${uname} не найден.\n\nПользователь должен был написать сообщение в группе.`,
    ownerProtected: '⛔ Нельзя удалять сообщения создателя группы.',
    resultAll: (group: string, deleted: number, range: string, mode: string) =>
      `✅ <b>${group}</b>\n\nУдалено <b>${deleted}</b> сообщений.\n📅 ${range}\n${mode}`,
    resultUser: (group: string, username: string, deleted: number, range: string, mode: string) =>
      `✅ <b>${group}</b>\n\n${username} — удалено <b>${deleted}</b> сообщений.\n📅 ${range}\n${mode}`,
    failedSome: (n: number) => `\n⚠️ ${n} сообщений не удалось удалить (уже удалены или слишком старые).`,
    groupNotFound: '❌ Группа не найдена.',
    error: '❌ Произошла ошибка. Попробуйте снова.',
    badDateFormat: 'Пример: <code>2026-01-01 2026-03-05</code>',
    badUserDateFormat: 'Пример: <code>@john 2026-01-01 2026-03-05</code>',
    dateOrderError: '❌ Дата начала должна быть раньше даты окончания.',
    badFormat: '❌ Неверный формат.\n\n',
    notOwner: (title: string) =>
      `<b>❌ Ошибка!</b>\n\nВы не являетесь создателем группы <b>${title}</b>.\n\nБот работает только в ваших группах. Выхожу.`,
    noAdminRights: (title: string) =>
      `<b>⚠️ ${title}</b>\n\nБот добавлен, но у него нет <b>прав администратора</b>.\n\n✅ Дайте право "Удаление сообщений".`,
    addedToGroup: (title: string) =>
      `✅ Успешно добавлен в <b>${title}</b>!\n\nТеперь используйте /start для управления сообщениями.`,
    mtMode: '🟢 MTProto (без лимита)',
    botApiMode: '🟡 Bot API (48ч)',
  },

  en: {
    langSelect: '🌐 <b>Choose language</b>\n\nTilni tanlang / Выберите язык:',
    langChanged: '✅ Language changed: 🇬🇧 English',
    langBtn: '🌐 Language',
    mtOn: '🟢 MTProto: Active (no time limit)',
    mtOff: '🟡 Bot API: Last 48 hours only',
    menuNoGroups: (status: string) =>
      `🛡 <b>Guardy Bot</b>\n\n${status}\n\nYou have no active groups yet.\n\nAdd the bot to a group (you must be the <b>owner/creator</b>) and grant admin rights:`,
    menuHasGroups: (status: string, count: number, list: string) =>
      `🛡 <b>Guardy Bot</b>\n\n${status}\n\n📋 Your groups (${count}):\n${list}\n\nPress the button below to delete messages:`,
    btnAddGroup: '➕ Add to group',
    btnDelete: '🗑️ Delete messages',
    btnAddNew: '➕ Add new group',
    btnHelp: '❓ Help',
    btnBack: '⬅️ Back',
    btnCancel: '❌ Cancel',
    btnMain: '🏠 Main menu',
    btnRepeat: '🔄 Delete again',
    helpText:
      '❓ <b>Help</b>\n\n' +
      '<b>1. Add bot to a group</b>\n' +
      '   • Press "➕ Add to group"\n' +
      '   • Works only in groups where you are the <b>creator/owner</b>\n\n' +
      '<b>2. Grant admin rights to bot</b>\n' +
      '   ✅ "Delete messages" permission required\n\n' +
      '<b>3. Delete modes:</b>\n' +
      '   🗓 Date range — all users\n' +
      '   👤 Single user messages\n\n' +
      '<b>❗ Note:</b>\n' +
      '   Group owner and bot messages are <b>never</b> deleted.',
    selectGroup: '📋 <b>Select a group:</b>',
    noGroups: '❌ No groups where you are owner and bot is added.\n\nPress "➕ Add to group" first.',
    deleteType: (group: string) => `🗑️ <b>${group}</b>\n\nWhat messages do you want to delete?`,
    btnAllMsgs: '🗓 Date range (all users)',
    btnUserMsgs: '👤 Single user messages',
    inputAllDate: (group: string, hint: string) =>
      `🗓 <b>${group} — enter date range</b>\n\nFormat: <code>YYYY-MM-DD YYYY-MM-DD</code>\nExample: <code>2026-01-01 2026-03-05</code>\n\n${hint}\n\n⛔ <i>Owner and bot messages are never deleted.</i>`,
    inputUserDate: (group: string, hint: string) =>
      `👤 <b>${group} — user messages</b>\n\nFormat: <code>@username YYYY-MM-DD YYYY-MM-DD</code>\nExample: <code>@john 2026-01-01 2026-03-05</code>\n\n${hint}\n\n⛔ <i>Group owner messages are never deleted.</i>`,
    mtHintOn: '✅ MTProto: Deletes messages of any age — no 48h limit.',
    mtHintOff: '⚠️ Bot API: Only last 48 hours (add TELEGRAM_SESSION to remove limit).',
    cancelled: '❌ Cancelled.',
    searching: (group: string) => `🔍 <b>${group}</b>\n\nSearching messages...`,
    deleting: (count: number) => `🗑️ Deleting <b>${count}</b> messages...\n<i>Please wait.</i>`,
    notFound: (range: string) => `ℹ️ No messages found to delete for <b>${range}</b>.`,
    notFoundUser: (username: string, range: string) => `ℹ️ No messages from ${username} found for <b>${range}</b>.`,
    userNotFound: (uname: string) => `❌ User @${uname} not found.\n\nUser must have sent a message in the group.`,
    ownerProtected: '⛔ Cannot delete messages from the group owner.',
    resultAll: (group: string, deleted: number, range: string, mode: string) =>
      `✅ <b>${group}</b>\n\n<b>${deleted}</b> messages deleted.\n📅 ${range}\n${mode}`,
    resultUser: (group: string, username: string, deleted: number, range: string, mode: string) =>
      `✅ <b>${group}</b>\n\n${username} — <b>${deleted}</b> messages deleted.\n📅 ${range}\n${mode}`,
    failedSome: (n: number) => `\n⚠️ ${n} messages could not be deleted (already removed or too old).`,
    groupNotFound: '❌ Group not found.',
    error: '❌ An error occurred. Please try again.',
    badDateFormat: 'Example: <code>2026-01-01 2026-03-05</code>',
    badUserDateFormat: 'Example: <code>@john 2026-01-01 2026-03-05</code>',
    dateOrderError: '❌ Start date must be before end date.',
    badFormat: '❌ Invalid format.\n\n',
    notOwner: (title: string) =>
      `<b>❌ Error!</b>\n\nYou are not the owner of group <b>${title}</b>.\n\nBot works only in groups you own. Leaving.`,
    noAdminRights: (title: string) =>
      `<b>⚠️ ${title}</b>\n\nBot was added but has no <b>admin rights</b>.\n\n✅ Please grant "Delete messages" permission.`,
    addedToGroup: (title: string) =>
      `✅ Successfully added to <b>${title}</b>!\n\nNow use /start to manage messages.`,
    mtMode: '🟢 MTProto (unlimited)',
    botApiMode: '🟡 Bot API (48h)',
  },
} as const;

export type Translations = typeof T.uz;

/** Helper: get translation with fallback to Uzbek */
export function tr(lang: Lang, key: keyof Translations): Translations[typeof key] {
  return (T[lang] as any)[key] ?? (T.uz as any)[key];
}