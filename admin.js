const express = require('express');
const db = require('../db');

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Требуется вход в админку' });
}

function buildAdminRouter({ adminLogin, adminPassword }) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { login, password } = req.body;
    if (login === adminLogin && password === adminPassword) {
      req.session.isAdmin = true;
      return res.json({ ok: true });
    }
    res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  router.get('/check', (req, res) => {
    res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
  });

  router.get('/users', requireAdmin, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    res.json({ users: db.getAllUsers(limit, offset) });
  });

  router.get('/stats', requireAdmin, (req, res) => {
    res.json(db.getStats());
  });

  router.get('/crash-rounds', requireAdmin, (req, res) => {
    res.json({ rounds: db.getLastCrashCoefficients(50) });
  });

  router.post('/users/:id/balance', requireAdmin, (req, res) => {
    const userId = Number(req.params.id);
    const amount = Math.floor(Number(req.body.amount));
    const note = req.body.note || 'Ручная корректировка администратором';
    if (!Number.isFinite(amount) || amount === 0) {
      return res.status(400).json({ error: 'Некорректная сумма' });
    }
    try {
      const balance = db.adjustBalanceAdmin(userId, amount, note);
      if (balance === null) return res.status(400).json({ error: 'Баланс не может уйти в минус' });
      res.json({ ok: true, balance });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/users/:id/ban', requireAdmin, (req, res) => {
    const userId = Number(req.params.id);
    db.setBanned(userId, !!req.body.banned);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { buildAdminRouter, requireAdmin };
