const cron = require('cron');
const Article = require('../models/Article');

class ArticlePublisher {
  constructor() {
    this.job = null;
    this.isRunning = false;
  }

  // Инициализация задачи публикации
  async init() {
    if (this.job) {
      this.job.stop();
      this.job = null;
    }

    // Запуск каждую минуту
    this.job = new cron.CronJob(
      '*/1 * * * *',
      async () => {
        if (this.isRunning) return;
        this.isRunning = true;
        try {
          const now = new Date();
          // Ищем статьи, срок которых наступил
          const articles = await Article.find({
            status: 'scheduled',
            scheduledAt: { $lte: now }
          });

          for (const article of articles) {
            article.status = 'published';
            article.publishedAt = article.scheduledAt || now;
            await article.save();
            console.log(`📢 Статья «${article.title}» опубликована по расписанию (${article._id})`);
          }
        } catch (error) {
          console.error('❌ Ошибка автоматической публикации статей:', error);
        } finally {
          this.isRunning = false;
        }
      },
      null,
      true,
      'Europe/Moscow'
    );

    console.log('🕒 Планировщик публикации статей инициализирован (каждую минуту)');
  }

  async stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('⏹️ Планировщик публикации статей остановлен');
    }
  }
}

module.exports = new ArticlePublisher(); 