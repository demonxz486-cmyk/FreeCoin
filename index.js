const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const path = require('path');
const fs = require('fs');

const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const PORT = process.env.PORT || 3000;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://your-app.com';

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(express.json());

// Имитация БД
const db = {
  rooms: {},
  leaderboard: [
    { name: 'DriftMaster', wins: 42 },
    { name: 'NeonSpeed', wins: 38 },
    { name: 'CyberRacer', wins: 31 }
  ]
};

// API Эндпоинты
app.get('/api/leaderboard', (req, res) => {
  const sorted = [...db.leaderboard].sort((a, b) => b.wins - a.wins).slice(0, 10);
  res.json(sorted);
});

app.post('/api/finish-race', (req, res) => {
  const { username, win, roomId } = req.body;
  if (win) {
    const user = db.leaderboard.find(u => u.name === username);
    if (user) user.wins += 1; else db.leaderboard.push({ name: username, wins: 1 });
  }
  if (roomId && db.rooms[roomId]) {
    delete db.rooms[roomId]; // Закрываем комнату после финиша
  }
  res.json({ success: true });
});

app.post('/api/create-room', (req, res) => {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  db.rooms[roomId] = { created: Date.now(), players: [] };
  res.json({ roomId });
});

app.post('/api/join-room', (req, res) => {
  const { roomId } = req.body;
  if (db.rooms[roomId]) {
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, message: 'Комната не найдена' });
  }
});

// Telegram Bot Logic
bot.start((ctx) => {
  return ctx.replyWithMarkdownV2(
    `🏎 *ДОБРО ПОЖАЛОВАТЬ В TURBO RACE\!*\n\nГотовы стать королем асфальта? Соревнуйтесь в реальном времени, создавайте приватные комнаты или ставьте рекорды в одиночных заездах\.\n\n🚦 *Три трассы с разным уровнем сложности*\n🏆 *Глобальный рейтинг лучших*\n👥 *Мультиплеер по секретному коду*`,
    Markup.inlineKeyboard([
      [Markup.button.webApp('🚀 НАЧАТЬ ГОНКУ', WEBAPP_URL)],
      [Markup.button.callback('🏆 Рекорды', 'stats'), Markup.button.callback('📖 Инструкция', 'help')]
    ])
  );
});

bot.action('stats', (ctx) => {
  const top = db.leaderboard.sort((a, b) => b.wins - a.wins).slice(0, 5);
  let text = '🏆 *ТОП-5 ГОНЩИКОВ*\n\n';
  top.forEach((u, i) => { text += `${i + 1}. ${u.name} — ${u.wins} побед\n`; });
  return ctx.editMessageText(text, { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'back_to_main')]]) });
});

bot.action('help', (ctx) => {
  return ctx.editMessageText('🎮 *ПРАВИЛА ИГРЫ*\n\n1. Нажмите на газ, чтобы разогнаться.\n2. Избегайте препятствий (скоро будут добавлены!).\n3. Пройдите дистанцию быстрее всех.\n4. Создайте комнату и скиньте код другу, чтобы играть вместе!', { 
    parse_mode: 'MarkdownV2', 
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'back_to_main')]]) 
  });
});

bot.action('back_to_main', (ctx) => {
  return ctx.editMessageText('🏎 *ГЛАВНОЕ МЕНЮ*', {
    parse_mode: 'MarkdownV2', 
    ...Markup.inlineKeyboard([
      [Markup.button.webApp('🚀 НАЧАТЬ ГОНКУ', WEBAPP_URL)],
      [Markup.button.callback('🏆 Рекорды', 'stats'), Markup.button.callback('📖 Инструкция', 'help')]
    ])
  });
});

bot.catch((err) => console.error('Bot Error:', err));

app.get('/', (req, res) => {
  res.set('Content-Type', 'text/html');
  res.send(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'));
});

const start = async () => {
  try {
    await bot.launch();
    app.listen(PORT, '0.0.0.0', () => console.log(`Server started on port ${PORT}`));
  } catch (e) {
    console.error(e);
  }
};

start();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));