const Domain = require('../models/Domain');

/**
 * Middleware для определения текущего домена
 * Поддерживает несколько способов определения домена
 */
const resolveDomain = async (req, res, next) => {
  try {
    let domain = null;
    
    // Метод 1: Заголовок от фронтенда (приоритетный)
    const domainContext = req.get('x-domain-context') || req.get('x-site-id');
    if (domainContext) {
      console.log(`🔍 Поиск домена по контексту: ${domainContext}`);
      
      domain = await Domain.findOne({
        $or: [
          { 'settings.indexationKey': domainContext },
          { name: { $regex: domainContext, $options: 'i' } }
        ],
        isActive: true
      });
      
      if (domain) {
        console.log(`✅ Домен найден по контексту: ${domain.name} (ID: ${domain._id})`);
        req.currentDomain = domain;
        return next();
      }
    }
    
    // Метод 2: По Host заголовку (текущий метод)
    const host = req.get('host') || req.get('x-forwarded-host') || req.hostname;
    if (host && !domain) {
      const cleanHost = host.split(':')[0];
      console.log(`🌐 Поиск домена по хосту: ${cleanHost}`);
      
      domain = await Domain.findOne({
        $or: [
          { url: { $regex: cleanHost, $options: 'i' } },
          { 'settings.aliases': { $in: [cleanHost] } }
        ],
        isActive: true
      });
      
      if (domain) {
        console.log(`✅ Домен найден по хосту: ${domain.name} (ID: ${domain._id})`);
        req.currentDomain = domain;
        return next();
      }
    }
    
    // Метод 3: По Referer/Origin
    const referer = req.get('referer') || req.get('origin');
    if (referer && !domain) {
      try {
        const url = new URL(referer);
        const pathname = url.pathname;
        
        // Проверяем популярные паттерны в пути
        const domainPatterns = {
          'crypto-modern': ['crypto-modern', 'modern'],
          'crypto-light': ['crypto-light', 'light'],
          'crypto-next': ['crypto-next', 'next'],
          'crypto-slatex': ['crypto-slatex', 'slatex'],
          'news-crypto-trader': ['news-crypto-trader', 'trader']
        };
        
        let domainKey = null;
        for (const [key, patterns] of Object.entries(domainPatterns)) {
          if (patterns.some(pattern => pathname.includes(pattern) || url.hostname.includes(pattern))) {
            domainKey = key;
            break;
          }
        }
        
        if (domainKey) {
          console.log(`🔗 Поиск домена по referer: ${domainKey}`);
          
          domain = await Domain.findOne({
            'settings.indexationKey': domainKey,
            isActive: true
          });
          
          if (domain) {
            console.log(`✅ Домен найден по referer: ${domain.name} (ID: ${domain._id})`);
            req.currentDomain = domain;
            return next();
          }
        }
      } catch (urlError) {
        console.log(`⚠️ Ошибка парсинга referer: ${urlError.message}`);
      }
    }
    
    // Метод 4: Домен по умолчанию из ENV
    if (!domain) {
      const defaultDomainKey = process.env.DEFAULT_DOMAIN_KEY || 'crypto-modern';
      console.log(`🔄 Использую домен по умолчанию: ${defaultDomainKey}`);
      
      domain = await Domain.findOne({
        'settings.indexationKey': defaultDomainKey,
        isActive: true
      });
      
      if (domain) {
        console.log(`✅ Установлен домен по умолчанию: ${domain.name} (ID: ${domain._id})`);
        req.currentDomain = domain;
        return next();
      }
    }
    
    // Если ничего не найдено
    if (!domain) {
      console.log(`❌ Домен не найден. Host: ${host}, Context: ${domainContext}, Referer: ${referer}`);
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