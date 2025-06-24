# 🚀 Деплой бэкенда на Vercel

## Подготовка

### 1. Environment Variables
В настройках Vercel проекта добавьте следующие переменные:

```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
PORT=5000
NODE_ENV=production
JWT_SECRET=your_super_secret_jwt_key_here_change_this_in_production
JWT_EXPIRE=7d
BCRYPT_ROUNDS=12
UPLOAD_PATH=uploads/
MAX_FILE_SIZE=10485760
FRONTEND_URL=https://your-frontend-domain.vercel.app
```

### 2. Vercel CLI установка
```bash
npm install -g vercel
```

## Деплой

### 1. Первый деплой
```bash
cd backNews
vercel
```

### 2. Последующие деплои
```bash
vercel --prod
```

## Важные особенности

### 🔒 Serverless ограничения
- Планировщик автоматически отключается в production
- Функции живут максимум 30 секунд
- Файлы uploads/ не сохраняются между запросами

### 🌐 CORS настроен для:
- Локальная разработка: localhost:3000, :5173, :5174
- Production: любые .vercel.app и .netlify.app домены
- Дополнительно: FRONTEND_URL из env

### 📝 Доступные роуты
- `/api/auth/*` - Аутентификация  
- `/api/admin/*` - Админ панель
- `/api/articles/*` - Статьи
- `/api/domains/*` - Домены
- `/sitemap.xml` - Sitemap
- `/robots.txt` - Robots.txt
- `/health` - Health check

## Проверка деплоя

```bash
# Проверка health
curl https://your-backend.vercel.app/health

# Проверка sitemap
curl https://your-backend.vercel.app/sitemap.xml

# Проверка API
curl https://your-backend.vercel.app/api/articles
```

## Troubleshooting

### Ошибка CORS
- Убедитесь что FRONTEND_URL правильно настроен
- Проверьте что домен фронтенда соответствует паттерну

### Ошибка подключения к БД
- Проверьте MONGODB_URI
- Убедитесь что IP адрес Vercel разрешен в MongoDB Atlas

### Таймаут функций
- Проверьте что запросы к БД не превышают 30 секунд
- Оптимизируйте медленные запросы 