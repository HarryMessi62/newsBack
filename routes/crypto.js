const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// GET /api/crypto/prices
router.get('/prices', async (req, res) => {
  try {
    const filePath = path.join(__dirname, '..', 'data', 'crypto-prices.json');
    if (!fs.existsSync(filePath)) {
      return res.status(503).json({
        success: false,
        message: 'Данные ещё не готовы. Попробуйте позже.'
      });
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    res.json({ success: true, updatedAt: parsed.updatedAt, data: parsed.data });
  } catch (error) {
    console.error('Ошибка чтения цен криптовалют:', error);
    res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router; 