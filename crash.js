// ИГРА CRASH
// Раунд: 5с фаза ставок -> множитель растёт с 1.00x -> в случайный момент "крах"
// Кто не успел забрать (cashout) до краха — теряет ставку.
// Коэффициент краха генерируется сервером ДО раунда, случайно, и никак не зависит
// от суммы ставок игроков — честная игра без подкрутки под конкретного пользователя.

const { applyDelta, saveCrashRound, getLastCrashCoefficients, getBalance } = require('../db');

const BETTING_PHASE_MS = 5000;   // 5 секунд между раундами на приём ставок
const TICK_MS = 100;             // частота обновления множителя
const HOUSE_EDGE = 0.04;         // 4% преимущество казино (индустриальный стандарт для crash-игр)
const GROWTH_RATE = 0.00012;     // скорость роста множителя
const MAX_MULTIPLIER = 1000;     // защитный потолок

function generateCrashPoint() {
  // Случайное число, независимое от ставок игроков
  const r = Math.random();
  // ~4% шанс мгновенного краха на 1.00x (тоже стандарт для честных crash-игр)
  if (r < 0.04) return 1.00;
  let point = (1 - HOUSE_EDGE) / (1 - r);
  point = Math.floor(point * 100) / 100;
  return Math.max(1.00, Math.min(point, MAX_MULTIPLIER));
}

function multiplierAtElapsed(elapsedMs) {
  const m = Math.exp(GROWTH_RATE * elapsedMs);
  return Math.floor(m * 100) / 100;
}

function attachCrashGame(io) {
  const nsp = io.of('/crash');

  let state = 'waiting'; // waiting | running | crashed
  let crashPoint = 0;
  let roundStartTs = 0;
  let waitingEndsTs = Date.now() + BETTING_PHASE_MS;
  let bets = new Map(); // userId -> { amount, socketId, cashedOut, cashoutAt }
  let tickTimer = null;

  function broadcastState(extra = {}) {
    nsp.emit('state', {
      state,
      waitingEndsTs: state === 'waiting' ? waitingEndsTs : null,
      last10: getLastCrashCoefficients(10),
      playersCount: bets.size,
      ...extra,
    });
  }

  function startWaitingPhase() {
    state = 'waiting';
    bets = new Map();
    waitingEndsTs = Date.now() + BETTING_PHASE_MS;
    broadcastState();
    setTimeout(startRunningPhase, BETTING_PHASE_MS);
  }

  function startRunningPhase() {
    if (bets.size === 0) {
      // Никто не поставил — просто быстро крутим новый раунд ставок, не тратим время сервера
      return startWaitingPhase();
    }
    state = 'running';
    crashPoint = generateCrashPoint();
    roundStartTs = Date.now();
    broadcastState({ startedAt: roundStartTs });

    tickTimer = setInterval(() => {
      const elapsed = Date.now() - roundStartTs;
      const m = multiplierAtElapsed(elapsed);
      if (m >= crashPoint) {
        clearInterval(tickTimer);
        return endRound();
      }
      nsp.emit('tick', { multiplier: m });
    }, TICK_MS);
  }

  function endRound() {
    state = 'crashed';
    saveCrashRound(crashPoint);

    // Все, кто не успел кэшаутнуться — проигрывают (ставка уже списана при размещении)
    nsp.emit('crash', { coefficient: crashPoint, last10: getLastCrashCoefficients(10) });

    setTimeout(startWaitingPhase, BETTING_PHASE_MS);
  }

  nsp.on('connection', (socket) => {
    broadcastState();

    socket.on('place_bet', ({ userId, amount }, cb) => {
      try {
        amount = Math.floor(Number(amount));
        if (state !== 'waiting') return cb?.({ ok: false, error: 'Ставки сейчас не принимаются' });
        if (!Number.isFinite(amount) || amount <= 0) return cb?.({ ok: false, error: 'Некорректная сумма' });
        if (bets.has(userId)) return cb?.({ ok: false, error: 'Ставка уже сделана в этом раунде' });

        const newBalance = applyDelta(userId, -amount, 'crash', { phase: 'bet' });
        if (newBalance === null) return cb?.({ ok: false, error: 'Недостаточно Дкоинов' });

        bets.set(userId, { amount, socketId: socket.id, cashedOut: false });
        socket.data.userId = userId;
        broadcastState();
        cb?.({ ok: true, balance: newBalance });
      } catch (e) {
        cb?.({ ok: false, error: 'Ошибка сервера' });
      }
    });

    socket.on('cashout', ({ userId }, cb) => {
      try {
        if (state !== 'running') return cb?.({ ok: false, error: 'Раунд не идёт' });
        const bet = bets.get(userId);
        if (!bet) return cb?.({ ok: false, error: 'Нет активной ставки' });
        if (bet.cashedOut) return cb?.({ ok: false, error: 'Уже забрано' });

        const elapsed = Date.now() - roundStartTs;
        const currentMultiplier = multiplierAtElapsed(elapsed);
        if (currentMultiplier >= crashPoint) return cb?.({ ok: false, error: 'Опоздал — уже краш' });

        const payout = Math.floor(bet.amount * currentMultiplier);
        const newBalance = applyDelta(userId, payout, 'crash', { phase: 'cashout', multiplier: currentMultiplier });
        bet.cashedOut = true;
        bet.cashoutAt = currentMultiplier;

        nsp.emit('player_cashout', { userId, multiplier: currentMultiplier });
        cb?.({ ok: true, multiplier: currentMultiplier, payout, balance: newBalance });
      } catch (e) {
        cb?.({ ok: false, error: 'Ошибка сервера' });
      }
    });

    socket.on('get_balance', ({ userId }, cb) => {
      cb?.({ balance: getBalance(userId) });
    });
  });

  // Запускаем игровой цикл
  startWaitingPhase();
}

module.exports = { attachCrashGame };
