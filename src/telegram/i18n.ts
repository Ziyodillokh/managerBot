export type Lang = 'uz' | 'ru';

export const LANG_LABELS: Record<Lang, string> = {
  uz: "🇺🇿 O'zbek",
  ru: '🇷🇺 Русский',
};

// ─── Month names for calendar ────────────────────────────────────────────────

export const MONTH_NAMES: Record<Lang, string[]> = {
  uz: [
    'Yanvar',
    'Fevral',
    'Mart',
    'Aprel',
    'May',
    'Iyun',
    'Iyul',
    'Avgust',
    'Sentabr',
    'Oktabr',
    'Noyabr',
    'Dekabr',
  ],
  ru: [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ],
};

export const DAY_HEADERS: Record<Lang, string[]> = {
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
};

// ─── Translation dictionary ─────────────────────────────────────────────────

export const T = {
  uz: {
    // Lang
    langSelect: '🌐 <b>Tilni tanlang / Выберите язык:</b>',
    langChanged: "✅ Til o'zgartirildi: 🇺🇿 O'zbek",
    langBtn: '🌐 Til',
    // MTProto status
    mtOn: '🟢 MTProto: Faol (cheksiz muddat)',
    mtOff: "🟡 Bot API: Faqat so'nggi 48 soat",
    // Main menu
    menuNoGroups: (status: string) =>
      `🛡 <b>Guardy Bot</b>\n\n${status}\n\nHozircha sizda faol guruh yo'q.\n\nBotni guruhga qo'shing (siz o'sha guruhning <b>egasi</b> yoki <b>admini</b> bo'lishingiz kerak) va admin huquqlarini bering:`,
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
      "<b>1. Botni guruhga qo'shing</b>\n" +
      '   • "➕ Guruhga qo\'shish" tugmasini bosing\n' +
      '   • Guruh <b>egasi</b> yoki <b>ruxsat berilgan admin</b> ishlata oladi\n\n' +
      '<b>2. Botga admin huquqi bering</b>\n' +
      '   ✅ "Delete messages" huquqi kerak\n\n' +
      "<b>3. Xabar o'chirish turlari:</b>\n" +
      '   🗓 Sana oraligida — barcha foydalanuvchilar\n' +
      '   👤 Bitta foydalanuvchi xabarlari\n\n' +
      '<b>4. 🛡 Himoyalangan foydalanuvchilar:</b>\n' +
      "   /add buyrug'i orqali himoyalangan ro'yxatga username qo'shing.\n" +
      "   Ularning xabarlari <b>hech qachon</b> o'chirilmaydi.\n\n" +
      '<b>5. 👥 Ruxsatlar (faqat guruh egasi):</b>\n' +
      "   Guruh adminlariga xabar o'chirish huquqini bering.\n\n" +
      '<b>❗ Eslatma:</b>\n' +
      "   Guruh egasi, botlar va himoyalangan foydalanuvchilar xabarlari <b>hech qachon</b> o'chirilmaydi.",
    // Delete flow
    selectGroup: '📋 <b>Guruhni tanlang:</b>',
    noGroups:
      "❌ Sizda bot qo'shilgan guruh yo'q.\n\nAvval \"➕ Guruhga qo'shish\" tugmasini bosing.",
    deleteType: (group: string) =>
      `🗑️ <b>${group}</b>\n\nQanday xabarlarni o'chirmoqchisiz?`,
    btnAllMsgs: '🗓 Sana oraligida (hammaning xabarlari)',
    btnUserMsgs: '👤 Bitta foydalanuvchi xabarlari',
    inputAllDate: (group: string, hint: string) =>
      `🗓 <b>${group} — sana oraligini kiriting</b>\n\nFormat: <code>YYYY-MM-DD YYYY-MM-DD</code>\nMisol: <code>2026-01-01 2026-03-05</code>\n\n${hint}\n\n⛔ <i>Guruh egasi va botlar xabarlari hech qachon o'chirilmaydi.</i>`,
    inputUserDate: (group: string, hint: string) =>
      `👤 <b>${group} — foydalanuvchi xabarlari</b>\n\nFormat: <code>@username YYYY-MM-DD YYYY-MM-DD</code>\nMisol: <code>@john 2026-01-01 2026-03-05</code>\n\n${hint}\n\n⛔ <i>Guruh egasining xabarlari hech qachon o'chirilmaydi.</i>`,
    mtHintOn: "✅ MTProto: Har qanday muddatdagi xabarlar o'chiriladi.",
    mtHintOff:
      "⚠️ Bot API: Faqat oxirgi 48 soatdagi xabarlar (muddatsiz rejim uchun TELEGRAM_SESSION qo'shing).",
    cancelled: '❌ Bekor qilindi.',
    searching: (group: string) =>
      `🔍 <b>${group}</b>\n\nXabarlar qidirilmoqda...`,
    deleting: (count: number) =>
      `🗑️ <b>${count}</b> ta xabar o'chirilmoqda...\n<i>Iltimos kuting.</i>`,
    notFound: (range: string) =>
      `ℹ️ <b>${range}</b> oraliqdagi o'chiriladigan xabarlar topilmadi.`,
    notFoundUser: (username: string, range: string) =>
      `ℹ️ ${username} foydalanuvchisining <b>${range}</b> oraliqdagi xabarlari topilmadi.`,
    userNotFound: (uname: string) =>
      `❌ @${uname} foydalanuvchisi topilmadi.\n\nFoydalanuvchi guruhda xabar yozgan bo'lishi kerak.`,
    ownerProtected: "⛔ Guruh egasining xabarlarini o'chirish mumkin emas.",
    resultAll: (group: string, deleted: number, range: string, mode: string) =>
      `✅ <b>${group}</b>\n\n<b>${deleted}</b> ta xabar o'chirildi.\n📅 ${range}\n${mode}`,
    resultUser: (
      group: string,
      username: string,
      deleted: number,
      range: string,
      mode: string,
    ) =>
      `✅ <b>${group}</b>\n\n${username} — <b>${deleted}</b> ta xabar o'chirildi.\n📅 ${range}\n${mode}`,
    failedSome: (n: number) =>
      `\n⚠️ ${n} ta xabar o'chirilmadi (allaqachon o'chirilgan yoki eski).`,
    groupNotFound: '❌ Guruh topilmadi.',
    error: "❌ Xatolik yuz berdi. Qayta urinib ko'ring.",
    badDateFormat: 'Misol: <code>2026-01-01 2026-03-05</code>',
    badUserDateFormat: 'Misol: <code>@john 2026-01-01 2026-03-05</code>',
    dateOrderError:
      "❌ Boshlanish sanasi tugash sanasidan oldin bo'lishi kerak.",
    badFormat: "❌ Format noto'g'ri.\n\n",
    notOwner: (title: string) =>
      `<b>❌ Xato!</b>\n\nSiz <b>${title}</b> guruhining egasi emassiz.\n\nBot faqat siz ega bo'lgan guruhlarda ishlaydi. Guruhdan chiqyapman.`,
    noAdminRights: (title: string) =>
      `<b>⚠️ ${title}</b>\n\nBot guruhga qo'shildi lekin <b>admin huquqi</b> berilmagan.\n\n✅ "Delete messages" huquqini bering, keyin ishlaydi.`,
    addedToGroup: (title: string) =>
      `✅ <b>${title}</b> guruhiga muvaffaqiyatli qo'shildim!\n\nEndi /start buyrug'i orqali xabarlarni boshqarishingiz mumkin.`,
    mtMode: '🟢 MTProto (cheksiz)',
    botApiMode: '🟡 Bot API (48s)',
    notMemberWarning:
      "⚠️ <b>Diqqat:</b> MTProto sessiyasi bu guruhning a'zosi emas.\n\n" +
      "🟡 <b>DB rejimiga o'tildi</b> — faqat bot faol bo'lgan davrdan beri\n" +
      "yig'ilgan xabarlar o'chiriladi (48s limiti bor).\n\n" +
      "<i>MTProto bilan eski xabarlarni o'chirish uchun session egasi ham guruh a'zosi bo'lishi kerak.</i>",

    // Calendar
    calendarTitle: (group: string, month: string, year: number) =>
      `📅 <b>${group}</b> — ${month} ${year}`,
    calendarSelectStart: '📅 <b>Boshlanish sanasini tanlang:</b>',
    calendarSelectEnd: (startDate: string) =>
      `📅 Boshlanish: <b>${startDate}</b>\n\n<b>Tugash sanasini tanlang:</b>`,
    calendarConfirm: (from: string, to: string) =>
      `📅 <b>${from}</b> — <b>${to}</b>\n\nTasdiqlaysizmi?`,
    btnConfirm: '✅ Tasdiqlash',

    // Protected users
    addPrompt:
      '🛡 Username kiriting (@ bilan yoki @ siz):\n\nMisol: <code>@username</code>',
    addSuccess: (username: string) =>
      `✅ @${username} himoyalangan ro'yxatga qo'shildi.`,
    addAlready: (username: string) => `ℹ️ @${username} allaqachon ro'yxatda.`,
    addRemoved: (username: string) =>
      `✅ @${username} ro'yxatdan olib tashlandi.`,
    addList: (list: string) =>
      `🛡 <b>Himoyalangan foydalanuvchilar:</b>\n\n${list}\n\n<i>Bu foydalanuvchilarning xabarlari hech qachon o'chirilmaydi.</i>`,
    addEmpty:
      "🛡 Himoyalangan foydalanuvchilar yo'q.\n\n➕ Qo'shish tugmasini bosing.",
    btnProtected: '🛡 Himoyalangan',
    btnAddUser: "➕ Qo'shish",

    // Access management
    accessGranted: (username: string, group: string) =>
      `✅ @${username} ga <b>${group}</b> guruhida o'chirish huquqi berildi.`,
    accessRevoked: (username: string, group: string) =>
      `✅ @${username} dan <b>${group}</b> guruhida huquq olib tashlandi.`,
    accessList: (group: string, list: string) =>
      `👥 <b>${group}</b> — ruxsat berilganlar:\n\n${list}`,
    accessEmpty: (group: string) =>
      `👥 <b>${group}</b> — hech kimga ruxsat berilmagan.\n\n➕ tugmani bosib admin qo'shing.`,
    btnAccess: '👥 Ruxsatlar',
    accessNotAdmin: '❌ Bu foydalanuvchi guruh admini emas.',
    accessPrompt:
      "👥 Admin username'ini kiriting:\n\nMisol: <code>@username</code>",
    accessSelectGroup: '👥 <b>Guruhni tanlang:</b>',

    // Username input for single-user delete
    inputUsername: (group: string) =>
      `👤 <b>${group}</b>\n\nFoydalanuvchi username'ini kiriting:\n\nMisol: <code>@username</code>`,
  },

  ru: {
    langSelect: '🌐 <b>Tilni tanlang / Выберите язык:</b>',
    langChanged: '✅ Язык изменён: 🇷🇺 Русский',
    langBtn: '🌐 Язык',
    mtOn: '🟢 MTProto: Активен (без ограничений)',
    mtOff: '🟡 Bot API: Только последние 48 часов',
    menuNoGroups: (status: string) =>
      `🛡 <b>Guardy Bot</b>\n\n${status}\n\nУ вас нет активных групп.\n\nДобавьте бота в группу (вы должны быть <b>владельцем</b> или <b>админом</b>) и дайте права администратора:`,
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
      '   • Работает для <b>владельца</b> и <b>админов с доступом</b>\n\n' +
      '<b>2. Дайте боту права администратора</b>\n' +
      '   ✅ "Удаление сообщений"\n\n' +
      '<b>3. Режимы удаления:</b>\n' +
      '   🗓 По диапазону дат — все пользователи\n' +
      '   👤 Сообщения одного пользователя\n\n' +
      '<b>4. 🛡 Защищённые пользователи:</b>\n' +
      '   Через /add добавьте username в защищённый список.\n' +
      '   Их сообщения <b>никогда</b> не удаляются.\n\n' +
      '<b>5. 👥 Доступы (только владелец):</b>\n' +
      '   Дайте админам группы право удалять сообщения.\n\n' +
      '<b>❗ Важно:</b>\n' +
      '   Сообщения владельца, ботов и защищённых пользователей <b>никогда</b> не удаляются.',
    selectGroup: '📋 <b>Выберите группу:</b>',
    noGroups:
      '❌ Нет групп, где добавлен бот.\n\nНажмите "➕ Добавить в группу".',
    deleteType: (group: string) =>
      `🗑️ <b>${group}</b>\n\nКакие сообщения удалить?`,
    btnAllMsgs: '🗓 По диапазону дат (все пользователи)',
    btnUserMsgs: '👤 Сообщения одного пользователя',
    inputAllDate: (group: string, hint: string) =>
      `🗓 <b>${group} — введите диапазон дат</b>\n\nФормат: <code>YYYY-MM-DD YYYY-MM-DD</code>\nПример: <code>2026-01-01 2026-03-05</code>\n\n${hint}\n\n⛔ <i>Сообщения создателя и ботов никогда не удаляются.</i>`,
    inputUserDate: (group: string, hint: string) =>
      `👤 <b>${group} — сообщения пользователя</b>\n\nФормат: <code>@username YYYY-MM-DD YYYY-MM-DD</code>\nПример: <code>@john 2026-01-01 2026-03-05</code>\n\n${hint}\n\n⛔ <i>Сообщения создателя группы не удаляются.</i>`,
    mtHintOn: '✅ MTProto: Удаляет сообщения любой давности.',
    mtHintOff:
      '⚠️ Bot API: Только последние 48 ч (добавьте TELEGRAM_SESSION для снятия ограничений).',
    cancelled: '❌ Отменено.',
    searching: (group: string) => `🔍 <b>${group}</b>\n\nПоиск сообщений...`,
    deleting: (count: number) =>
      `🗑️ Удаляется <b>${count}</b> сообщений...\n<i>Пожалуйста, подождите.</i>`,
    notFound: (range: string) =>
      `ℹ️ Нет сообщений для удаления за <b>${range}</b>.`,
    notFoundUser: (username: string, range: string) =>
      `ℹ️ Сообщений от ${username} за <b>${range}</b> не найдено.`,
    userNotFound: (uname: string) =>
      `❌ Пользователь @${uname} не найден.\n\nПользователь должен был написать сообщение в группе.`,
    ownerProtected: '⛔ Нельзя удалять сообщения создателя группы.',
    resultAll: (group: string, deleted: number, range: string, mode: string) =>
      `✅ <b>${group}</b>\n\nУдалено <b>${deleted}</b> сообщений.\n📅 ${range}\n${mode}`,
    resultUser: (
      group: string,
      username: string,
      deleted: number,
      range: string,
      mode: string,
    ) =>
      `✅ <b>${group}</b>\n\n${username} — удалено <b>${deleted}</b> сообщений.\n📅 ${range}\n${mode}`,
    failedSome: (n: number) =>
      `\n⚠️ ${n} сообщений не удалось удалить (уже удалены или слишком старые).`,
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
    notMemberWarning:
      '⚠️ <b>Внимание:</b> MTProto сессия не является участником этой группы.\n\n' +
      '🟡 <b>Переключено на DB режим</b> — удаляются только сообщения,\n' +
      'собранные ботом с момента его добавления (лимит 48ч).\n\n' +
      '<i>Для удаления старых сообщений через MTProto владелец сессии должен быть участником группы.</i>',

    // Calendar
    calendarTitle: (group: string, month: string, year: number) =>
      `📅 <b>${group}</b> — ${month} ${year}`,
    calendarSelectStart: '📅 <b>Выберите начальную дату:</b>',
    calendarSelectEnd: (startDate: string) =>
      `📅 Начало: <b>${startDate}</b>\n\n<b>Выберите конечную дату:</b>`,
    calendarConfirm: (from: string, to: string) =>
      `📅 <b>${from}</b> — <b>${to}</b>\n\nПодтверждаете?`,
    btnConfirm: '✅ Подтвердить',

    // Protected users
    addPrompt:
      '🛡 Введите username (с @ или без):\n\nПример: <code>@username</code>',
    addSuccess: (username: string) =>
      `✅ @${username} добавлен в защищённый список.`,
    addAlready: (username: string) => `ℹ️ @${username} уже в списке.`,
    addRemoved: (username: string) => `✅ @${username} удалён из списка.`,
    addList: (list: string) =>
      `🛡 <b>Защищённые пользователи:</b>\n\n${list}\n\n<i>Сообщения этих пользователей никогда не удаляются.</i>`,
    addEmpty: '🛡 Нет защищённых пользователей.\n\n➕ Нажмите "Добавить".',
    btnProtected: '🛡 Защищённые',
    btnAddUser: '➕ Добавить',

    // Access management
    accessGranted: (username: string, group: string) =>
      `✅ @${username} получил право удаления в <b>${group}</b>.`,
    accessRevoked: (username: string, group: string) =>
      `✅ У @${username} отозвано право удаления в <b>${group}</b>.`,
    accessList: (group: string, list: string) =>
      `👥 <b>${group}</b> — пользователи с доступом:\n\n${list}`,
    accessEmpty: (group: string) =>
      `👥 <b>${group}</b> — доступ никому не выдан.\n\nНажмите ➕ чтобы добавить админа.`,
    btnAccess: '👥 Доступы',
    accessNotAdmin: '❌ Этот пользователь не является админом группы.',
    accessPrompt:
      '👥 Введите username админа:\n\nПример: <code>@username</code>',
    accessSelectGroup: '👥 <b>Выберите группу:</b>',

    // Username input for single-user delete
    inputUsername: (group: string) =>
      `👤 <b>${group}</b>\n\nВведите username пользователя:\n\nПример: <code>@username</code>`,
  },
} as const;
