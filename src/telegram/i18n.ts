export type Lang = 'uz' | 'ru';

export const LANG_LABELS: Record<Lang, string> = {
  uz: "🇺🇿 O'zbek",
  ru: '🇷🇺 Русский',
};

export const MONTH_NAMES: Record<Lang, string[]> = {
  uz: [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
  ],
  ru: [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
  ],
};

export const DAY_HEADERS: Record<Lang, string[]> = {
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
};

// ─── Translation dictionary ─────────────────────────────────────────────────

export const T = {
  uz: {
    langChanged: "✅ Til o'zgartirildi: 🇺🇿 O'zbek",
    langBtn: '🌐 Til',
    mtOn: '🟢 MTProto: Faol (cheksiz muddat)',
    mtOff: "🟡 Bot API: Faqat so'nggi 48 soat",
    menuNoGroups: (status: string) =>
      `🛡 <b>Guardy Bot</b>\n\n${status}\n\nHozircha sizda faol guruh yo'q.\nBotni guruhga qo'shing va admin huquqlarini bering:`,
    menuHasGroups: (status: string, count: number, list: string) =>
      `🛡 <b>Guardy Bot</b>\n\n${status}\n\n📋 Sizning guruhlaringiz (${count}):\n${list}`,
    btnAddGroup: "➕ Guruhga qo'shish",
    btnDelete: "🗑️ Xabarlarni o'chirish",
    btnAddNew: "➕ Yangi guruh qo'shish",
    btnHelp: '❓ Yordam',
    btnBack: '⬅️ Orqaga',
    btnCancel: '❌ Bekor qilish',
    btnMain: '🏠 Bosh menyu',
    btnRepeat: "🔄 Yana o'chirish",
    btnToday: 'Bugun',
    helpText:
      '❓ <b>Yordam</b>\n\n' +
      "<b>1. Botni guruhga qo'shing</b>\n" +
      "   \"➕ Guruhga qo'shish\" tugmasini bosing\n\n" +
      '<b>2. Botga admin huquqi bering</b>\n' +
      '   "Delete messages" huquqini yoqing\n\n' +
      "<b>3. Xabar o'chirish</b>\n" +
      "   📅 Kalendar orqali sana oraligini tanlang\n" +
      "   Barcha xabarlar o'chiriladi\n" +
      "   (egasi, botlar, himoyalangan — tashqari)\n\n" +
      '<b>4. 🛡 Himoyalangan</b>\n' +
      "   /add — himoyalangan ro'yxatga username qo'shish\n" +
      "   Ularning xabarlari hech qachon o'chirilmaydi\n\n" +
      '<b>5. 👥 Ruxsatlar (faqat guruh egasi)</b>\n' +
      "   Guruh adminlariga o'chirish huquqini bering\n" +
      '   Ruxsat berilganlar ham to\'liq (MTProto) rejimda ishlaydi',
    selectGroup: '📋 <b>Guruhni tanlang:</b>',
    noGroups:
      "❌ Sizda bot qo'shilgan guruh yo'q.\n\n\"➕ Guruhga qo'shish\" tugmasini bosing.",
    searching: (group: string) =>
      `🔍 <b>${group}</b>\n\nXabarlar qidirilmoqda...`,
    deleting: (count: number) =>
      `🗑️ <b>${count}</b> ta xabar o'chirilmoqda...\n<i>Iltimos kuting.</i>`,
    notFound: (range: string) =>
      `ℹ️ <b>${range}</b> oralig'ida o'chiriladigan xabar topilmadi.`,
    userNotFound: (uname: string) =>
      `❌ @${uname} foydalanuvchisi topilmadi.\n\nFoydalanuvchi guruhda xabar yozgan bo'lishi kerak.`,
    resultAll: (group: string, deleted: number, range: string, mode: string) =>
      `✅ <b>${group}</b>\n\n🗑️ <b>${deleted}</b> ta xabar o'chirildi\n📅 ${range}\n${mode}`,
    failedSome: (n: number) =>
      `\n⚠️ ${n} ta xabar o'chirilmadi (allaqachon o'chirilgan yoki eski).`,
    groupNotFound: '❌ Guruh topilmadi.',
    error: "❌ Xatolik yuz berdi. Qayta urinib ko'ring.",
    dateOrderError: "❌ Boshlanish sanasi tugash sanasidan oldin bo'lishi kerak.",
    badFormat: "❌ Format noto'g'ri.\n\n",
    notOwner: (title: string) =>
      `<b>❌ Xato!</b>\n\nSiz <b>${title}</b> guruhining egasi yoki admini emassiz.\nGuruhdan chiqyapman.`,
    noAdminRights: (title: string) =>
      `<b>⚠️ ${title}</b>\n\nBot guruhga qo'shildi lekin <b>admin huquqi</b> berilmagan.\n\n✅ "Delete messages" huquqini bering.`,
    addedToGroup: (title: string) =>
      `✅ <b>${title}</b> guruhiga muvaffaqiyatli qo'shildim!\n\n/start — boshqaruv paneli`,
    mtMode: '🟢 MTProto (cheksiz)',
    botApiMode: '🟡 Bot API (48s)',
    notMemberWarning:
      "⚠️ <b>Diqqat:</b> MTProto sessiyasi bu guruhning a'zosi emas.\n\n" +
      "🟡 <b>DB rejimiga o'tildi</b> — faqat bot faol bo'lgan davrdan beri " +
      "yig'ilgan xabarlar o'chiriladi (48s limiti bor).\n\n" +
      "<i>MTProto uchun session egasi ham guruh a'zosi bo'lishi kerak.</i>",
    calendarTitle: (group: string, month: string, year: number) =>
      `📅 <b>${group}</b> — ${month} ${year}`,
    calendarSelectStart: '📅 <b>Boshlanish sanasini tanlang:</b>',
    calendarSelectEnd: (startDate: string) =>
      `📅 Boshlanish: <b>${startDate}</b>\n\n<b>Tugash sanasini tanlang:</b>`,
    calendarConfirm: (group: string, from: string, to: string) =>
      `🗑️ <b>${group}</b>\n\n` +
      `📅 <b>${from}</b> — <b>${to}</b>\n\n` +
      `⚠️ Shu sanalar orasidagi barcha xabarlar o'chiriladi.\n` +
      `<i>(egasi, botlar va himoyalangan — tashqari)</i>\n\n` +
      `Tasdiqlaysizmi?`,
    btnConfirm: '✅ Tasdiqlash',
    addPrompt: '🛡 Username kiriting:\n\nMisol: <code>@username</code>',
    addSuccess: (username: string) =>
      `✅ @${username} himoyalangan ro'yxatga qo'shildi.`,
    addAlready: (username: string) =>
      `ℹ️ @${username} allaqachon ro'yxatda.`,
    addRemoved: (username: string) =>
      `✅ @${username} ro'yxatdan olib tashlandi.`,
    addList: (list: string) =>
      `🛡 <b>Himoyalangan foydalanuvchilar:</b>\n\n${list}\n\n<i>Ularning xabarlari hech qachon o'chirilmaydi.</i>`,
    addEmpty: "🛡 Himoyalangan foydalanuvchilar yo'q.\n\n➕ Qo'shish tugmasini bosing.",
    btnProtected: '🛡 Himoyalangan',
    btnAddUser: "➕ Qo'shish",
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
    accessPrompt: "👥 Admin username'ini kiriting:\n\nMisol: <code>@username</code>",
    accessSelectGroup: '👥 <b>Guruhni tanlang:</b>',
  },

  ru: {
    langChanged: '✅ Язык изменён: 🇷🇺 Русский',
    langBtn: '🌐 Язык',
    mtOn: '🟢 MTProto: Активен (без ограничений)',
    mtOff: '🟡 Bot API: Только последние 48 часов',
    menuNoGroups: (status: string) =>
      `🛡 <b>Guardy Bot</b>\n\n${status}\n\nУ вас нет активных групп.\nДобавьте бота в группу и дайте права администратора:`,
    menuHasGroups: (status: string, count: number, list: string) =>
      `🛡 <b>Guardy Bot</b>\n\n${status}\n\n📋 Ваши группы (${count}):\n${list}`,
    btnAddGroup: '➕ Добавить в группу',
    btnDelete: '🗑️ Удалить сообщения',
    btnAddNew: '➕ Добавить новую группу',
    btnHelp: '❓ Помощь',
    btnBack: '⬅️ Назад',
    btnCancel: '❌ Отмена',
    btnMain: '🏠 Главное меню',
    btnRepeat: '🔄 Удалить ещё',
    btnToday: 'Сегодня',
    helpText:
      '❓ <b>Помощь</b>\n\n' +
      '<b>1. Добавьте бота в группу</b>\n' +
      '   "➕ Добавить в группу"\n\n' +
      '<b>2. Дайте боту права администратора</b>\n' +
      '   "Удаление сообщений"\n\n' +
      '<b>3. Удаление сообщений</b>\n' +
      '   📅 Выберите диапазон дат через календарь\n' +
      '   Все сообщения будут удалены\n' +
      '   (кроме владельца, ботов, защищённых)\n\n' +
      '<b>4. 🛡 Защищённые</b>\n' +
      '   /add — добавить username в защищённый список\n' +
      '   Их сообщения никогда не удаляются\n\n' +
      '<b>5. 👥 Доступы (только владелец)</b>\n' +
      '   Дайте админам группы право удаления\n' +
      '   Доступ включает полный (MTProto) режим',
    selectGroup: '📋 <b>Выберите группу:</b>',
    noGroups: '❌ Нет групп с ботом.\n\nНажмите "➕ Добавить в группу".',
    searching: (group: string) => `🔍 <b>${group}</b>\n\nПоиск сообщений...`,
    deleting: (count: number) =>
      `🗑️ Удаляется <b>${count}</b> сообщений...\n<i>Подождите.</i>`,
    notFound: (range: string) =>
      `ℹ️ Нет сообщений для удаления за <b>${range}</b>.`,
    userNotFound: (uname: string) =>
      `❌ @${uname} не найден.\n\nПользователь должен был написать в группе.`,
    resultAll: (group: string, deleted: number, range: string, mode: string) =>
      `✅ <b>${group}</b>\n\n🗑️ Удалено <b>${deleted}</b> сообщений\n📅 ${range}\n${mode}`,
    failedSome: (n: number) =>
      `\n⚠️ ${n} сообщений не удалось (уже удалены или старые).`,
    groupNotFound: '❌ Группа не найдена.',
    error: '❌ Ошибка. Попробуйте снова.',
    dateOrderError: '❌ Начальная дата должна быть раньше конечной.',
    badFormat: '❌ Неверный формат.\n\n',
    notOwner: (title: string) =>
      `<b>❌ Ошибка!</b>\n\nВы не админ группы <b>${title}</b>.\nВыхожу.`,
    noAdminRights: (title: string) =>
      `<b>⚠️ ${title}</b>\n\nБот добавлен, но нет <b>прав админа</b>.\n\n✅ Дайте право "Удаление сообщений".`,
    addedToGroup: (title: string) =>
      `✅ Добавлен в <b>${title}</b>!\n\n/start — панель управления`,
    mtMode: '🟢 MTProto (без лимита)',
    botApiMode: '🟡 Bot API (48ч)',
    notMemberWarning:
      '⚠️ <b>Внимание:</b> MTProto сессия не участник этой группы.\n\n' +
      '🟡 <b>DB режим</b> — удаляются только сообщения ' +
      'собранные ботом (лимит 48ч).\n\n' +
      '<i>Для MTProto владелец сессии должен быть в группе.</i>',
    calendarTitle: (group: string, month: string, year: number) =>
      `📅 <b>${group}</b> — ${month} ${year}`,
    calendarSelectStart: '📅 <b>Выберите начальную дату:</b>',
    calendarSelectEnd: (startDate: string) =>
      `📅 Начало: <b>${startDate}</b>\n\n<b>Выберите конечную дату:</b>`,
    calendarConfirm: (group: string, from: string, to: string) =>
      `🗑️ <b>${group}</b>\n\n` +
      `📅 <b>${from}</b> — <b>${to}</b>\n\n` +
      `⚠️ Все сообщения в этом диапазоне будут удалены.\n` +
      `<i>(кроме владельца, ботов и защищённых)</i>\n\n` +
      `Подтверждаете?`,
    btnConfirm: '✅ Подтвердить',
    addPrompt: '🛡 Введите username:\n\nПример: <code>@username</code>',
    addSuccess: (username: string) =>
      `✅ @${username} добавлен в защищённый список.`,
    addAlready: (username: string) => `ℹ️ @${username} уже в списке.`,
    addRemoved: (username: string) => `✅ @${username} удалён из списка.`,
    addList: (list: string) =>
      `🛡 <b>Защищённые пользователи:</b>\n\n${list}\n\n<i>Их сообщения никогда не удаляются.</i>`,
    addEmpty: '🛡 Нет защищённых.\n\n➕ Нажмите "Добавить".',
    btnProtected: '🛡 Защищённые',
    btnAddUser: '➕ Добавить',
    accessGranted: (username: string, group: string) =>
      `✅ @${username} получил право удаления в <b>${group}</b>.`,
    accessRevoked: (username: string, group: string) =>
      `✅ У @${username} отозвано право в <b>${group}</b>.`,
    accessList: (group: string, list: string) =>
      `👥 <b>${group}</b> — с доступом:\n\n${list}`,
    accessEmpty: (group: string) =>
      `👥 <b>${group}</b> — доступ никому не выдан.\n\n➕ Добавьте админа.`,
    btnAccess: '👥 Доступы',
    accessNotAdmin: '❌ Этот пользователь не админ группы.',
    accessPrompt: '👥 Введите username админа:\n\nПример: <code>@username</code>',
    accessSelectGroup: '👥 <b>Выберите группу:</b>',
  },
} as const;
