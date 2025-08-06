const Domain = require('../models/Domain');

/**
 * Middleware для определения текущего домена по заголовку Host
 * Добавляет информацию о домене в req.currentDomain
 */
const resolveDomain = async (req, res, next) => {
  try {
    // Получаем хост из заголовка
    const host = req.get('host') || req.get('x-forwarded-host') || req.hostname;
    
    if (!host) {
      console.log('⚠️ Не удалось определить хост');
      return next();
    }

    // Убираем порт из хоста если есть
    const cleanHost = host.split(':')[0];
    
    console.log(`🌐 Определяем домен для хоста: ${cleanHost}`);

    // Ищем домен в базе данных
    // Проверяем как основной URL так и алиасы
    const domain = await Domain.findOne({
      $or: [
        { url: { $regex: cleanHost, $options: 'i' } },
        { 'settings.aliases': { $in: [cleanHost] } }
      ],
      status: 'active'
    });

    if (domain) {
      req.currentDomain = domain;
      console.log(`✅ Найден домен: ${domain.name} (ID: ${domain._id})`);
    } else {
      console.log(`❌ Домен не найден для хоста: ${cleanHost}`);
      // Можно добавить логику для домена по умолчанию
      req.currentDomain = null;
    }

    next();
  } catch (error) {
    console.error('❌ Ошибка определения домена:', error);
    req.currentDomain = null;
    next();
  }
};

module.exports = resolveDomain; 