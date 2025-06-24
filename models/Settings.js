const mongoose = require('mongoose');

const ParserSettingsSchema = new mongoose.Schema({
  maxConcurrentRequests: {
    type: Number,
    default: 5,
    min: 1,
    max: 50
  },
  requestTimeout: {
    type: Number,
    default: 30000,
    min: 5000,
    max: 120000
  },
  articlesPerDay: {
    type: Number,
    default: 100,
    min: 10,
    max: 10000
  },
  allowedDomains: [{
    type: String,
    trim: true
  }],
  blockedDomains: [{
    type: String,
    trim: true
  }],
  proxySettings: {
    enabled: {
      type: Boolean,
      default: false
    },
    proxyList: [{
      type: String,
      trim: true
    }],
    rotationInterval: {
      type: Number,
      default: 60,
      min: 1,
      max: 1440
    }
  }
});

const IPSettingsSchema = new mongoose.Schema({
  blockedIPs: [{
    ip: {
      type: String,
      required: true
    },
    blockedUntil: {
      type: Date,
      default: null // null означает бессрочную блокировку
    },
    reason: {
      type: String,
      required: true
    },
    blockedAt: {
      type: Date,
      default: Date.now
    }
  }],
  autoBlockEnabled: {
    type: Boolean,
    default: true
  },
  maxRequestsPerMinute: {
    type: Number,
    default: 60,
    min: 1,
    max: 1000
  },
  blockDuration: {
    type: Number,
    default: 15, // минуты
    min: 1,
    max: 10080 // неделя
  },
  whitelistedIPs: [{
    type: String,
    trim: true
  }]
});

const BackupSettingsSchema = new mongoose.Schema({
  autoBackupEnabled: {
    type: Boolean,
    default: false
  },
  backupSchedule: {
    type: String,
    default: '0 2 * * *' // cron expression - каждый день в 2:00
  },
  backupRetentionDays: {
    type: Number,
    default: 30,
    min: 1,
    max: 365
  },
  backupLocation: {
    type: String,
    default: 'local',
    enum: ['local', 's3', 'ftp']
  },
  lastBackupDate: {
    type: Date
  },
  backupHistory: [{
    date: {
      type: Date,
      default: Date.now
    },
    size: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['success', 'failed'],
      required: true
    },
    path: {
      type: String,
      required: true
    },
    error: String
  }]
});

const SettingsSchema = new mongoose.Schema({
  // Уникальный ключ - всегда будет только одна запись настроек
  key: {
    type: String,
    default: 'system-settings',
    unique: true
  },
  parser: {
    type: ParserSettingsSchema,
    default: () => ({})
  },
  ip: {
    type: IPSettingsSchema,
    default: () => ({})
  },
  backup: {
    type: BackupSettingsSchema,
    default: () => ({})
  }
}, {
  timestamps: true,
  versionKey: false
});

// Индексы для оптимизации
SettingsSchema.index({ key: 1 });
SettingsSchema.index({ 'ip.blockedIPs.ip': 1 });
SettingsSchema.index({ 'ip.blockedIPs.blockedUntil': 1 });

// Методы для работы с настройками
SettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne({ key: 'system-settings' });
  
  if (!settings) {
    // Создаем настройки по умолчанию
    settings = new this({ key: 'system-settings' });
    await settings.save();
  }
  
  return settings;
};

SettingsSchema.statics.updateSettings = async function(newSettings) {
  return await this.findOneAndUpdate(
    { key: 'system-settings' },
    { $set: newSettings },
    { 
      new: true, 
      upsert: true,
      runValidators: true
    }
  );
};

// Методы для работы с IP блокировками
SettingsSchema.statics.blockIP = async function(ip, duration, reason) {
  const settings = await this.getSettings();
  
  // Удаляем существующую блокировку если есть
  settings.ip.blockedIPs = settings.ip.blockedIPs.filter(blocked => blocked.ip !== ip);
  
  // Добавляем новую блокировку
  const blockedUntil = duration ? new Date(Date.now() + duration * 60000) : null;
  settings.ip.blockedIPs.push({
    ip,
    reason,
    blockedUntil,
    blockedAt: new Date()
  });
  
  await settings.save();
  return settings;
};

SettingsSchema.statics.unblockIP = async function(ip) {
  const settings = await this.getSettings();
  settings.ip.blockedIPs = settings.ip.blockedIPs.filter(blocked => blocked.ip !== ip);
  await settings.save();
  return settings;
};

SettingsSchema.statics.isIPBlocked = async function(ip) {
  const settings = await this.getSettings();
  const blocked = settings.ip.blockedIPs.find(blocked => blocked.ip === ip);
  
  if (!blocked) return false;
  
  // Проверяем не истекла ли блокировка
  if (blocked.blockedUntil && new Date() > blocked.blockedUntil) {
    // Удаляем истекшую блокировку
    settings.ip.blockedIPs = settings.ip.blockedIPs.filter(b => b.ip !== ip);
    await settings.save();
    return false;
  }
  
  return true;
};

// Методы для работы с резервными копиями
SettingsSchema.statics.addBackupRecord = async function(size, status, path, error = null) {
  const settings = await this.getSettings();
  
  settings.backup.backupHistory.push({
    date: new Date(),
    size,
    status,
    path,
    error
  });
  
  if (status === 'success') {
    settings.backup.lastBackupDate = new Date();
  }
  
  // Оставляем только последние 100 записей
  if (settings.backup.backupHistory.length > 100) {
    settings.backup.backupHistory = settings.backup.backupHistory.slice(-100);
  }
  
  await settings.save();
  return settings;
};

module.exports = mongoose.model('Settings', SettingsSchema); 