// Проверка initData, которую Telegram Mini App присылает с фронтенда.
// Это защищает от подделки user_id — без токена бота подписать данные нельзя.
const crypto = require('crypto');

function verifyInitData(initData, botToken) {
  if (!initData || typeof initData !== 'string') return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckArr = [];
  for (const [key, value] of [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  // Дополнительно: отклоняем initData старше 24 часов
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

  const userJson = params.get('user');
  if (!userJson) return null;
  try {
    return JSON.parse(userJson); // { id, username, first_name, ... }
  } catch {
    return null;
  }
}

// Express-мидлвар: ожидает заголовок X-Telegram-Init-Data
function telegramAuthMiddleware(botToken) {
  return (req, res, next) => {
    const initData = req.headers['x-telegram-init-data'];
    const user = verifyInitData(initData, botToken);
    if (!user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Неверные или отсутствующие данные Telegram' });
    }
    req.tgUser = user;
    next();
  };
}

module.exports = { verifyInitData, telegramAuthMiddleware };
