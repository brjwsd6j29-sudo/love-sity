const express = require('express');
const db = require('../db');
const coinflip = require('../games/coinflip');
const plinko = require('../games/plinko');

function buildApiRouter({ startBalance }) {
  const router = express.Router();

  // Профиль — создаёт пользователя при первом заходе
  router.get('/me', (req, res) => {
    const tg = req.tgUser;
    const user = db.getOrCreateUser(
      { id: tg.id, username: tg.username, first_name: tg.first_name },
      startBalance
    );
    res.json({ id: user.id, username: user.username, first_name: user.first_name, balance: user.balance });
  });

  router.get('/balance', (req, res) => {
    res.json({ balance: db.getBalance(req.tgUser.id) });
  });

  router.get('/leaderboard', (req, res) => {
    res.json({ leaders: db.getLeaderboard(20) });
  });

  router.get('/history', (req, res) => {
    res.json({ history: db.getHistory(req.tgUser.id, 30) });
  });

  // ---------- Монетка ----------
  router.post('/coinflip', (req, res) => {
    const userId = req.tgUser.id;
    let { amount, choice } = req.body;
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Некорректная сумма ставки' });
    }
    if (choice !== 'heads' && choice !== 'tails') {
      return res.status(400).json({ error: 'Выбери орёл или решку' });
    }

    // Списываем ставку
    let balance = db.applyDelta(userId, -amount, 'coinflip', { phase: 'bet', choice });
    if (balance === null) {
      return res.status(400).json({ error: 'Недостаточно Дкоинов' });
    }

    const result = coinflip.play(choice);
    let payout = 0;
    if (result.win) {
      payout = Math.floor(amount * result.multiplier);
      balance = db.applyDelta(userId, payout, 'coinflip', { phase: 'win', result: result.result });
    }

    res.json({
      result: result.result,
      win: result.win,
      choice,
      amount,
      payout,
      multiplier: result.multiplier,
      balance,
    });
  });

  // ---------- Плинко ----------
  router.post('/plinko', (req, res) => {
    const userId = req.tgUser.id;
    let { amount, risk } = req.body;
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Некорректная сумма ставки' });
    }
    if (!['low', 'medium', 'high'].includes(risk)) risk = 'medium';

    let balance = db.applyDelta(userId, -amount, 'plinko', { phase: 'bet', risk });
    if (balance === null) {
      return res.status(400).json({ error: 'Недостаточно Дкоинов' });
    }

    const result = plinko.drop(risk);
    const payout = Math.floor(amount * result.multiplier);
    if (payout > 0) {
      balance = db.applyDelta(userId, payout, 'plinko', { phase: 'win', bucketIndex: result.bucketIndex });
    }

    res.json({
      path: result.path,
      bucketIndex: result.bucketIndex,
      multiplier: result.multiplier,
      amount,
      payout,
      risk,
      balance,
    });
  });

  return router;
}

module.exports = { buildApiRouter };
