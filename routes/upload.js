const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
// Используем встроенный crypto для генерации UUID
const crypto = require('crypto');

const router = express.Router();

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    
    // Создаем директорию если её нет
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    // Создаем поддиректории по типам файлов
    const fileType = file.mimetype.startsWith('image/') ? 'images' : 'videos';
    const typePath = path.join(uploadPath, fileType);
    
    if (!fs.existsSync(typePath)) {
      fs.mkdirSync(typePath, { recursive: true });
    }
    
    cb(null, typePath);
  },
  filename: (req, file, cb) => {
    // Генерируем уникальное имя файла
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const filename = `${file.fieldname}-${uniqueSuffix}${extension}`;
    cb(null, filename);
  }
});

// Фильтр для проверки типов файлов
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/ogg'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Неподдерживаемый тип файла'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB по умолчанию
  },
  fileFilter: fileFilter
});

/**
 * @swagger
 * /upload/image:
 *   post:
 *     tags: [Upload]
 *     summary: Загрузка изображения
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               alt:
 *                 type: string
 *               caption:
 *                 type: string
 *     responses:
 *       200:
 *         description: Изображение загружено
 *       400:
 *         description: Ошибка загрузки
 */
router.post('/image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Файл не был загружен'
      });
    }

    const { alt, caption } = req.body;
    const fileUrl = `/uploads/images/${req.file.filename}`;

    res.json({
      success: true,
      message: 'Изображение успешно загружено',
      data: {
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        alt: alt || '',
        caption: caption || ''
      }
    });
  } catch (error) {
    console.error('Ошибка загрузки изображения:', error);
    
    // Удаляем файл если произошла ошибка
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке изображения',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /upload/video:
 *   post:
 *     tags: [Upload]
 *     summary: Загрузка видео
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Видео загружено
 */
router.post('/video', authenticateToken, upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Файл не был загружен'
      });
    }

    const { title, description } = req.body;
    const fileUrl = `/uploads/videos/${req.file.filename}`;

    res.json({
      success: true,
      message: 'Видео успешно загружено',
      data: {
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        title: title || '',
        description: description || ''
      }
    });
  } catch (error) {
    console.error('Ошибка загрузки видео:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка загрузки файла'
    });
  }
});

/**
 * @swagger
 * /upload/multiple-images:
 *   post:
 *     tags: [Upload]
 *     summary: Загрузка нескольких изображений
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Изображения загружены
 */
router.post('/multiple-images', authenticateToken, upload.array('images', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Файлы не были загружены'
      });
    }

    const uploadedFiles = req.files.map((file, index) => ({
      url: `/uploads/images/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      position: index,
      alt: '',
      caption: ''
    }));

    res.json({
      success: true,
      message: `${uploadedFiles.length} изображений успешно загружено`,
      data: { files: uploadedFiles }
    });
  } catch (error) {
    console.error('Ошибка загрузки изображений:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка загрузки файлов'
    });
  }
});

/**
 * @swagger
 * /upload/delete/{filename}:
 *   delete:
 *     tags: [Upload]
 *     summary: Удаление загруженного файла
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Файл удален
 */
router.delete('/delete/:filename', authenticateToken, (req, res) => {
  try {
    const { filename } = req.params;
    
    // Ищем файл в директориях images и videos
    const imagePath = path.join(__dirname, '../uploads/images', filename);
    const videoPath = path.join(__dirname, '../uploads/videos', filename);
    
    let filePath = null;
    
    if (fs.existsSync(imagePath)) {
      filePath = imagePath;
    } else if (fs.existsSync(videoPath)) {
      filePath = videoPath;
    }
    
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: 'Файл не найден'
      });
    }
    
    // Удаляем файл
    fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      message: 'Файл успешно удален'
    });
  } catch (error) {
    console.error('Ошибка удаления файла:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка удаления файла'
    });
  }
});

/**
 * @swagger
 * /upload/files:
 *   get:
 *     tags: [Upload]
 *     summary: Получение списка загруженных файлов пользователя
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [images, videos, all]
 *           default: all
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Список файлов
 */
router.get('/files', authenticateToken, (req, res) => {
  try {
    const { type = 'all', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const uploadPath = path.join(__dirname, '../uploads');
    const files = [];
    
    // Функция для получения файлов из директории
    const getFilesFromDir = (dir, fileType) => {
      const dirPath = path.join(uploadPath, dir);
      if (!fs.existsSync(dirPath)) return [];
      
      return fs.readdirSync(dirPath)
        .filter(file => {
          const filePath = path.join(dirPath, file);
          return fs.statSync(filePath).isFile();
        })
        .map(file => {
          const filePath = path.join(dirPath, file);
          const stats = fs.statSync(filePath);
          return {
            filename: file,
            url: `/uploads/${dir}/${file}`,
            type: fileType,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime
          };
        });
    };
    
    // Получаем файлы в зависимости от типа
    if (type === 'images' || type === 'all') {
      files.push(...getFilesFromDir('images', 'image'));
    }
    
    if (type === 'videos' || type === 'all') {
      files.push(...getFilesFromDir('videos', 'video'));
    }
    
    // Сортируем по дате создания (новые первыми)
    files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Пагинация
    const total = files.length;
    const paginatedFiles = files.slice(skip, skip + parseInt(limit));
    
    res.json({
      success: true,
      data: {
        files: paginatedFiles,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Ошибка получения списка файлов:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения списка файлов'
    });
  }
});

// Middleware для обработки ошибок multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Файл слишком большой. Максимальный размер: 10MB'
      });
    }
    
    return res.status(400).json({
      success: false,
      message: 'Ошибка загрузки файла'
    });
  }
  
  if (error.message === 'Неподдерживаемый тип файла') {
    return res.status(400).json({
      success: false,
      message: 'Неподдерживаемый тип файла. Разрешены: JPEG, PNG, GIF, WebP, MP4, WebM, OGG'
    });
  }
  
  next(error);
});

module.exports = router; 