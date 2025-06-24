const cron = require('cron');
const NewsParser = require('./newsParser');
const ParserSettings = require('../models/ParserSettings');

class Scheduler {
  constructor() {
    this.parserJob = null;
    this.isRunning = false;
    this.currentParser = null;
  }

  // Инициализация планировщика
  async init() {
    try {
      console.log('🕒 Инициализация планировщика...');
      
      // Проверяем настройки парсера
      const settings = await ParserSettings.findOne({});
      if (settings && settings.parser.enabled) {
        await this.scheduleParser();
        console.log('✅ Планировщик парсера активирован');
      } else {
        console.log('⏸️ Планировщик парсера неактивен');
      }
    } catch (error) {
      console.error('❌ Ошибка инициализации планировщика:', error);
    }
  }

  // Создание расписания для парсера
  async scheduleParser() {
    try {
      // Останавливаем существующую задачу
      if (this.parserJob) {
        this.parserJob.stop();
        this.parserJob.destroy();
      }

      const settings = await ParserSettings.findOne({});
      if (!settings || !settings.parser.enabled) {
        console.log('⏹️ Парсер отключен, планировщик остановлен');
        return;
      }

      // Конвертируем интервал в cron-выражение
      const cronExpression = this.convertToCron(settings.parser.schedule);
      
      console.log(`📅 Настройка расписания парсера: ${settings.parser.schedule} (${cronExpression})`);

      this.parserJob = new cron.CronJob(
        cronExpression,
        async () => {
          await this.runParser();
        },
        null,
        true,
        'Europe/Moscow'
      );

      // Обновляем время следующего запуска
      settings.calculateNextRun();
      await settings.save();

      console.log(`⏰ Следующий запуск парсера: ${settings.stats.nextRunAt?.toLocaleString('ru-RU')}`);

    } catch (error) {
      console.error('❌ Ошибка настройки расписания парсера:', error);
    }
  }

  // Конвертация интервала в cron-выражение
  convertToCron(schedule) {
    const cronExpressions = {
      '15min': '*/15 * * * *',  // Каждые 15 минут
      '30min': '*/30 * * * *',  // Каждые 30 минут
      '1h': '0 * * * *',        // Каждый час
      '2h': '0 */2 * * *',      // Каждые 2 часа
      '4h': '0 */4 * * *',      // Каждые 4 часа
      '8h': '0 */8 * * *',      // Каждые 8 часов
      '12h': '0 */12 * * *',    // Каждые 12 часов
      '24h': '0 0 * * *'        // Каждые 24 часа (в полночь)
    };

    return cronExpressions[schedule] || cronExpressions['4h'];
  }

  // Запуск парсера
  async runParser() {
    // Проверяем, не выполняется ли уже парсинг
    if (this.isRunning) {
      console.log('⚠️ Парсер уже выполняется, пропускаем текущий запуск');
      return;
    }

    try {
      this.isRunning = true;
      console.log('🚀 Автоматический запуск парсера...');

      // Проверяем актуальные настройки
      const settings = await ParserSettings.findOne({});
      if (!settings || !settings.parser.enabled) {
        console.log('⏹️ Парсер отключен, остановка планировщика');
        await this.stop();
        return;
      }

      // Создаем и запускаем парсер
      this.currentParser = new NewsParser();
      await this.currentParser.init();
      
      const result = await this.currentParser.parseNews({
        manual: false
      });

      console.log(`✅ Автоматический парсинг завершен: ${result.articlesSuccess}/${result.articlesProcessed} успешно`);

      // Если изменилось расписание, обновляем его
      const updatedSettings = await ParserSettings.findOne({});
      if (updatedSettings.parser.schedule !== settings.parser.schedule) {
        console.log('📅 Обнаружено изменение расписания, обновляем планировщик...');
        await this.scheduleParser();
      }

    } catch (error) {
      console.error('❌ Ошибка автоматического парсинга:', error);
      
      // Уведомляем об ошибке (можно добавить отправку email)
      await this.notifyError(error);
      
    } finally {
      this.isRunning = false;
      this.currentParser = null;
    }
  }

  // Остановка парсера
  async stop() {
    try {
      console.log('⏹️ Остановка планировщика парсера...');
      
      if (this.parserJob) {
        this.parserJob.stop();
        this.parserJob.destroy();
        this.parserJob = null;
      }

      // Если парсер работает, ждем его завершения
      if (this.isRunning && this.currentParser) {
        console.log('⏳ Ожидание завершения текущего парсинга...');
        // Здесь можно добавить логику принудительной остановки парсера
      }

      console.log('✅ Планировщик парсера остановлен');
    } catch (error) {
      console.error('❌ Ошибка остановки планировщика:', error);
    }
  }

  // Обновление расписания
  async updateSchedule() {
    try {
      console.log('🔄 Обновление расписания парсера...');
      await this.scheduleParser();
    } catch (error) {
      console.error('❌ Ошибка обновления расписания:', error);
    }
  }

  // Получение статуса планировщика
  getStatus() {
    return {
      isActive: !!this.parserJob,
      isRunning: this.isRunning,
      nextRun: this.parserJob ? this.parserJob.nextDate() : null,
      jobExists: !!this.parserJob
    };
  }

  // Уведомление об ошибке
  async notifyError(error) {
    try {
      // Здесь можно добавить отправку уведомлений по email
      // или интеграцию с системами мониторинга
      console.log('📧 Отправка уведомления об ошибке парсера:', error.message);
      
      // Можно логировать в файл или отправлять в внешние сервисы
    } catch (notifyError) {
      console.error('❌ Ошибка отправки уведомления:', notifyError);
    }
  }

  // Ручной запуск парсера (для тестирования)
  async manualRun(options = {}) {
    if (this.isRunning) {
      throw new Error('Парсер уже выполняется');
    }

    try {
      this.isRunning = true;
      console.log('🎯 Ручной запуск парсера...');

      const parser = new NewsParser();
      await parser.init();
      
      const result = await parser.parseNews({
        manual: true,
        ...options
      });

      console.log(`✅ Ручной парсинг завершен: ${result.articlesSuccess}/${result.articlesProcessed} успешно`);
      return result;

    } finally {
      this.isRunning = false;
    }
  }

  // Проверка должен ли запускаться парсер
  static async shouldRun() {
    try {
      return await NewsParser.shouldRun();
    } catch (error) {
      console.error('❌ Ошибка проверки необходимости запуска парсера:', error);
      return false;
    }
  }
}

// Создаем глобальный экземпляр планировщика
const scheduler = new Scheduler();

module.exports = scheduler; 