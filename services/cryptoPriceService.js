const cron = require('cron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class CryptoPriceService {
  constructor() {
    this.job = null;
    this.isRunning = false;
    this.dataDir = path.join(__dirname, '..', 'data');
    this.filePath = path.join(this.dataDir, 'crypto-prices.json');

    // Используем символы (tickers) для CoinPaprika
    this.cryptoSymbols = [
      'BTC',
      'ETH',
      'ADA',
      'SOL',
      'DOT',
      'DOGE',
      'XRP',
      'LTC',
      'TRX',
      'LINK'
    ];

    // CoinPaprika не требует ключ
    this.apiKey = '';
  }

  async fetchPrices() {
    try {
      const formatted = {};
      const response = await axios.get('https://api.coinpaprika.com/v1/tickers', { timeout: 20000 });
      const tickers = response.data;

      const wanted = new Set(this.cryptoSymbols);

      tickers.forEach((t) => {
        if (!wanted.has(t.symbol.toUpperCase())) return;
        const price = t.quotes.USD.price;
        const percent = t.quotes.USD.percent_change_24h;
        const symbol = t.symbol.toUpperCase();
        formatted[symbol] = {
          symbol,
          name: t.name,
          price,
          change24h: price * percent / 100,
          changePercent24h: percent,
          marketCap: t.quotes.USD.market_cap || null
        };
      });

      if (Object.keys(formatted).length === 0) {
        throw new Error('CoinPaprika did not return expected tickers');
      }

      // Записываем файл
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({ updatedAt: new Date().toISOString(), data: formatted }, null, 2),
        'utf8'
      );
      console.log('💾 Цены криптовалют обновлены');
    } catch (error) {
      console.error('❌ Ошибка получения цен криптовалют:', error.message || error);
    }
  }

  async init() {
    // Сделаем первый запрос сразу
    await this.fetchPrices();

    // Запуск каждый час в начале часа
    this.job = new cron.CronJob(
      '0 * * * *', // каждый час
      async () => {
        if (this.isRunning) return;
        this.isRunning = true;
        try {
          await this.fetchPrices();
        } finally {
          this.isRunning = false;
        }
      },
      null,
      true,
      'UTC'
    );

    console.log('🕒 Сервис цен криптовалют запущен (обновление каждый час)');
  }

  async stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('⏹️ Сервис цен криптовалют остановлен');
    }
  }
}

module.exports = new CryptoPriceService(); 