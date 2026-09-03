require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { Telegraf } = require('telegraf');

const { Server: SocketIOServer } = require('socket.io');
const { telegramAuthMiddleware } = require('./telegramAuth');
const { buildApiRouter } = require('./routes/api');
const { buildAdminRouter } = require('./routes/admin');
const { attachCrashGame } = require('./games/crash');

const {
  BOT_TOKEN,
  PUBLIC_URL,
  PORT = 3000,
  ADMIN_LOGIN = 'admin',
  ADMIN_PASSWORD = 'change_me',
  SESSION_SECRET = 'insecure_default_change_me',
  START_BALANCE = 1000,
} = process.env;

if (!BOT_TOKEN) {
  console.error('ОШИБКА: не задан BOT_TOKEN в .env файле. Скопируй .env.example -> .env и заполни его.');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 часов
}));

// ---------- Статика ----------
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- API ----------
app.use('/api', telegramAuthMiddleware(BOT_TOKEN), buildApiRouter({ startBalance: Number(START_BALANCE) }));
app.use('/admin-api', buildAdminRouter({ adminLogin: ADMIN_LOGIN, adminPassword: ADMIN_PASSWORD }));

// ---------- Crash игра (Socket.io namespace /crash) ----------
attachCrashGame(io);

// ---------- Telegram-бот ----------
const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
  const webAppUrl = PUBLIC_URL;
  ctx.reply(
    `Привет, ${ctx.from.first_name || 'игрок'}! 👋\n\nДобро пожаловать в Дкоины — виртуальный игровой центр с Crash, Монеткой и Плинко.\n\nЭто развлекательная игра: Дкоины виртуальные, их нельзя вывести или обменять на реальные деньги.`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: '🎮 Открыть игру', web_app: { url: webAppUrl } }]],
      },
    }
  );
});

bot.command('balance', async (ctx) => {
  const db = require('./db');
  const user = db.getOrCreateUser(
    { id: ctx.from.id, username: ctx.from.username, first_name: ctx.from.first_name },
    Number(START_BALANCE)
  );
  ctx.reply(`💰 Твой баланс: ${user.balance} Дкоинов`);
});

bot.launch().then(() => console.log('✅ Telegram-бот запущен'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

server.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`   Mini App:  ${PUBLIC_URL}`);
  console.log(`   Админка:   ${PUBLIC_URL}/admin`);
});
