const mongoose = require('mongoose');
const Article = require('../models/Article');
const User = require('../models/User');
const Domain = require('../models/Domain');
require('dotenv').config();

const testArticles = [
  {
    title: 'Bitcoin достиг нового исторического максимума',
    content: `<p>Bitcoin продолжает свой впечатляющий рост, достигнув нового исторического максимума в $105,000. Этот рост обусловлен растущим институциональным интересом и принятием криптовалют.</p>

<p>Основные факторы роста:</p>
<ul>
<li>Институциональные инвестиции</li>
<li>Ограниченное предложение</li>
<li>Растущий спрос</li>
<li>Макроэкономические факторы</li>
</ul>

<p>Аналитики прогнозируют дальнейший рост в ближайшие месяцы, ссылаясь на фундаментальные факторы и техническую динамику рынка.</p>`,
    excerpt: 'Bitcoin установил новый исторический рекорд, преодолев отметку в $105,000 благодаря растущему институциональному интересу.',
    category: 'Bitcoin News',
    tags: ['bitcoin', 'рекорд', 'рост', 'инвестиции'],
    status: 'published',
    publishedAt: new Date(),
    imageUrl: '/uploads/images/bitcoin-ath.jpg'
  },
  {
    title: 'Ethereum 2.0: Новые возможности стейкинга',
    content: `<p>Обновление Ethereum 2.0 принесло революционные изменения в мир стейкинга. Теперь пользователи могут получать до 8% годовых от стейкинга ETH.</p>

<p>Ключевые особенности:</p>
<ul>
<li>Снижение энергопотребления на 99%</li>
<li>Высокие награды за стейкинг</li>
<li>Улучшенная масштабируемость</li>
<li>Повышенная безопасность сети</li>
</ul>

<p>Это делает Ethereum более привлекательным для долгосрочных инвесторов и способствует стабилизации цены.</p>`,
    excerpt: 'Ethereum 2.0 предлагает новые возможности для стейкинга с высокими наградами и улучшенной эффективностью.',
    category: 'Ethereum News',
    tags: ['ethereum', 'стейкинг', 'eth2', 'обновление'],
    status: 'published',
    publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    imageUrl: '/uploads/images/ethereum-staking.jpg'
  },
  {
    title: 'DeFi протоколы показывают рекордный рост TVL',
    content: `<p>Децентрализованные финансы (DeFi) переживают новую волну роста. Общий заблокированный объем (TVL) достиг $200 миллиардов.</p>

<p>Лидеры по TVL:</p>
<ul>
<li>Uniswap - $12 млрд</li>
<li>Aave - $10 млрд</li>
<li>Compound - $8 млрд</li>
<li>MakerDAO - $7 млрд</li>
</ul>

<p>Рост обусловлен новыми инновационными продуктами и растущим доверием институциональных инвесторов к DeFi.</p>`,
    excerpt: 'DeFi сектор демонстрирует впечатляющий рост с TVL в $200 миллиардов, привлекая все больше институциональных инвесторов.',
    category: 'DeFi News',
    tags: ['defi', 'tvl', 'рост', 'протоколы'],
    status: 'published',
    publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    imageUrl: '/uploads/images/defi-growth.jpg'
  },
  {
    title: 'Новые регулятивные изменения в криптоиндустрии',
    content: `<p>Регуляторы по всему миру работают над созданием четких правил для криптовалютной индустрии. Это создает больше определенности для инвесторов.</p>

<p>Ключевые изменения:</p>
<ul>
<li>Лицензирование криптобирж</li>
<li>Налогообложение криптоактивов</li>
<li>Защита прав инвесторов</li>
<li>Борьба с отмыванием денег</li>
</ul>

<p>Эксперты считают, что четкое регулирование поможет развитию индустрии и привлечет больше институциональных инвесторов.</p>`,
    excerpt: 'Новые регулятивные изменения создают более четкие правила для криптоиндустрии и защищают права инвесторов.',
    category: 'Regulation',
    tags: ['регулирование', 'законы', 'криптовалюты', 'лицензии'],
    status: 'published',
    publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    imageUrl: '/uploads/images/crypto-regulation.jpg'
  },
  {
    title: 'Altcoin сезон: какие монеты показывают лучшие результаты',
    content: `<p>Альткоины переживают период активного роста. Многие проекты показывают впечатляющие результаты, превосходя Bitcoin по доходности.</p>

<p>Топ альткоинов по росту:</p>
<ul>
<li>Solana (SOL) - +150%</li>
<li>Cardano (ADA) - +120%</li>
<li>Polygon (MATIC) - +110%</li>
<li>Chainlink (LINK) - +95%</li>
</ul>

<p>Рост обусловлен развитием экосистем, новыми партнерствами и растущим интересом к инновационным блокчейн-решениям.</p>`,
    excerpt: 'Altcoin сезон в полном разгаре: многие альтернативные криптовалюты показывают трехзначный рост за последний месяц.',
    category: 'Altcoin News',
    tags: ['альткоины', 'рост', 'solana', 'cardano'],
    status: 'published',
    publishedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    imageUrl: '/uploads/images/altcoin-season.jpg'
  },
  {
    title: 'NFT рынок: новые тренды и перспективы',
    content: `<p>Рынок NFT продолжает эволюционировать, находя новые применения за пределами цифрового искусства. Игровые NFT и утилитарные токены набирают популярность.</p>

<p>Новые тренды:</p>
<ul>
<li>Gaming NFT и метавселенные</li>
<li>Утилитарные NFT с реальными функциями</li>
<li>Фракционные NFT</li>
<li>NFT в недвижимости</li>
</ul>

<p>Эксперты прогнозируют рост практического применения NFT в различных отраслях экономики.</p>`,
    excerpt: 'NFT рынок развивается в сторону практического применения, выходя за рамки цифрового искусства.',
    category: 'NFT News',
    tags: ['nft', 'игры', 'метавселенная', 'тренды'],
    status: 'published',
    publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    imageUrl: '/uploads/images/nft-trends.jpg'
  }
];

async function createTestArticles() {
  try {
    // Подключение к MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/backnews');
    console.log('Подключено к MongoDB');

    // Проверяем существующие статьи
    const existingArticlesCount = await Article.countDocuments();
    console.log(`Существующих статей: ${existingArticlesCount}`);

    if (existingArticlesCount > 0) {
      console.log('Статьи уже существуют в базе данных. Пропускаем создание.');
      process.exit(0);
    }

    // Получаем первого пользователя как автора
    const user = await User.findOne();
    if (!user) {
      console.log('Не найден пользователь. Создайте пользователя сначала.');
      process.exit(1);
    }

    // Получаем первый домен
    let domain = await Domain.findOne();
    if (!domain) {
      // Создаем тестовый домен если его нет
      domain = new Domain({
        name: 'CryptoNews',
        url: 'localhost:5000',
        settings: {
          allowArticles: true,
          maxArticlesPerDay: 100
        }
      });
      await domain.save();
      console.log('Создан тестовый домен');
    }

    // Создаем статьи
    for (const articleData of testArticles) {
      const article = new Article({
        ...articleData,
        author: user._id,
        domain: domain._id,
        stats: {
          views: {
            total: Math.floor(Math.random() * 10000) + 1000,
            unique: Math.floor(Math.random() * 8000) + 800,
            today: Math.floor(Math.random() * 500) + 50
          },
          likes: {
            total: Math.floor(Math.random() * 500) + 50,
            today: Math.floor(Math.random() * 50) + 5
          },
          comments: {
            total: Math.floor(Math.random() * 100) + 10,
            today: Math.floor(Math.random() * 10) + 1
          }
        }
      });

      await article.save();
      console.log(`Создана статья: ${article.title}`);
    }

    console.log(`Успешно создано ${testArticles.length} тестовых статей`);
    process.exit(0);

  } catch (error) {
    console.error('Ошибка создания тестовых статей:', error);
    process.exit(1);
  }
}

// Запуск скрипта если он вызван напрямую
if (require.main === module) {
  createTestArticles();
}

module.exports = createTestArticles; 