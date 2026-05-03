require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// --- КОНФИГУРАЦИЯ ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('Ошибка: BOT_TOKEN не задан в переменные окружения!');
  process.exit(1);
}

// Временная БД в памяти
const db = {};

const DEFAULT_USER = {
  coins: 0,
  tapPower: 1,
  autoClickRate: 0,
  energy: 100,
  maxEnergy: 100,
  lastUpdate: Date.now(),
  level: 1,
  lastDaily: 0
};

// --- ЛОГИКА ИГРЫ ---

function refreshUser(userId) {
  const user = db[userId];
  if (!user) return null;

  const now = Date.now();
  const diffMs = now - user.lastUpdate;
  const diffInSec = Math.floor(diffMs / 1000);

  if (diffInSec > 0) {
    // Начисляем автоклик
    if (user.autoClickRate > 0) {
      user.coins += user.autoClickRate * diffInSec;
    }

    // Восстановление энергии: 1 ед. каждые 3 секунды
    const energyRecovery = Math.floor(diffInSec / 3);
    if (energyRecovery > 0) {
      user.energy = Math.min(user.maxEnergy, user.energy + energyRecovery);
    }

    // Обновляем время только на целое количество секунд, чтобы не терять доли секунд
    user.lastUpdate += diffInSec * 1000;
  }

  user.level = Math.floor(user.coins / 1000) + 1;
  return user;
}

const bot = new Telegraf(BOT_TOKEN);

const getMainMenu = (user) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`🚀 Тапать (🔋 ${user.energy})`, 'tap')],
    [Markup.button.callback('🛒 Магазин', 'shop'), Markup.button.callback('👤 Профиль', 'profile')],
    [Markup.button.callback('🏆 Топ', 'leaderboard'), Markup.button.callback('🎁 Бонус', 'daily')]
  ]);
};

// --- ОБРАБОТЧИКИ ---

bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id;
    if (!db[userId]) db[userId] = { ...DEFAULT_USER, lastUpdate: Date.now() };
    await ctx.reply('Добро пожаловать в Tap-игру! Нажимай на ракету!', getMainMenu(db[userId]));
  } catch (e) {
    console.error('Start error:', e);
  }
});

bot.action('tap', async (ctx) => {
  try {
    const user = refreshUser(ctx.from.id);
    if (!user) return;

    if (user.energy <= 0) {
      return ctx.answerCbQuery('Энергия на нуле!', { show_alert: true });
    }

    user.energy -= 1;
    user.coins += user.tapPower;

    await ctx.editMessageText(
      `🪙 Монеты: ${Math.floor(user.coins)}\n🔋 Энергия: ${user.energy}/${user.maxEnergy}`,
      getMainMenu(user)
    );
    await ctx.answerCbQuery(`+${user.tapPower}`);
  } catch (e) {
    console.error('Tap action error:', e);
  }
});

bot.action('profile', async (ctx) => {
  try {
    const user = refreshUser(ctx.from.id);
    const text = `👤 Игрок: ${ctx.from.first_name}\n🏅 Уровень: ${user.level}\n🪙 Баланс: ${Math.floor(user.coins)}`;
    await ctx.editMessageText(text, Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'back')]]));
  } catch (e) {
    console.error('Profile action error:', e);
  }
});

bot.action('shop', async (ctx) => {
  try {
    const user = refreshUser(ctx.from.id);
    const tapPrice = user.tapPower * 50;
    const autoPrice = (user.autoClickRate + 1) * 200;
    const text = `🛒 Магазин\n💰 Баланс: ${Math.floor(user.coins)}\n\n1. Сила тапа: ${tapPrice}\n2. Автокликер: ${autoPrice}`;
    await ctx.editMessageText(text, Markup.inlineKeyboard([
      [Markup.button.callback('Купить Тап', 'buy_tap')],
      [Markup.button.callback('Купить Авто', 'buy_auto')],
      [Markup.button.callback('« Назад', 'back')]
    ]));
  } catch (e) {
    console.error('Shop action error:', e);
  }
});

bot.action('buy_tap', async (ctx) => {
  try {
    const user = refreshUser(ctx.from.id);
    const price = user.tapPower * 50;
    if (user.coins >= price) {
      user.coins -= price;
      user.tapPower += 1;
      await ctx.answerCbQuery('Улучшено!');
      return ctx.editMessageText('Сила тапа увеличена!', Markup.inlineKeyboard([[Markup.button.callback('В магазин', 'shop')]]));
    }
    await ctx.answerCbQuery('Недостаточно монет!');
  } catch (e) {
    console.error('Buy tap error:', e);
  }
});

bot.action('buy_auto', async (ctx) => {
  try {
    const user = refreshUser(ctx.from.id);
    const price = (user.autoClickRate + 1) * 200;
    if (user.coins >= price) {
      user.coins -= price;
      user.autoClickRate += 1;
      await ctx.answerCbQuery('Куплено!');
      return ctx.editMessageText('Автокликер работает!', Markup.inlineKeyboard([[Markup.button.callback('В магазин', 'shop')]]));
    }
    await ctx.answerCbQuery('Недостаточно монет!');
  } catch (e) {
    console.error('Buy auto error:', e);
  }
});

bot.action('leaderboard', async (ctx) => {
  try {
    const top = Object.entries(db)
      .sort(([, a], [, b]) => b.coins - a.coins)
      .slice(0, 5)
      .map(([id, p], i) => `${i + 1}. ID ${id}: ${Math.floor(p.coins)}`).join('\n');
    await ctx.editMessageText(`🏆 ТОП 5:\n\n${top || 'Пусто'}`, Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'back')]]));
  } catch (e) {
    console.error('Leaderboard error:', e);
  }
});

bot.action('daily', async (ctx) => {
  try {
    const user = refreshUser(ctx.from.id);
    const now = Date.now();
    if (now - user.lastDaily > 86400000) {
      const reward = 500 * user.level;
      user.coins += reward;
      user.lastDaily = now;
      await ctx.answerCbQuery(`Бонус ${reward} получен!`, { show_alert: true });
    } else {
      await ctx.answerCbQuery('Приходите завтра!');
    }
  } catch (e) {
    console.error('Daily bonus error:', e);
  }
});

bot.action('back', async (ctx) => {
  try {
    const user = refreshUser(ctx.from.id);
    await ctx.editMessageText('Главное меню:', getMainMenu(user));
  } catch (e) {
    console.error('Back error:', e);
  }
});

// --- СЕРВЕР И ОШИБКИ ---
bot.catch((err, ctx) => console.error(`Telegraf error (${ctx.updateType}):`, err));

const server = http.createServer((req, res) => {
  res.writeHead(200); res.end('OK');
});

server.listen(PORT, () => console.log(`Health check on port ${PORT}`));

bot.launch().then(() => console.log('Bot started'));

process.once('SIGINT', () => { bot.stop('SIGINT'); server.close(); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); server.close(); });
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));