const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BackNews API',
      version: '1.0.0',
      description: 'API для системы управления новостными панелями с админскими и пользовательскими возможностями',
      contact: {
        name: 'API Support',
        email: 'support@backnews.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000/api',
        description: 'Development server'
      },
      {
        url: 'https://your-production-domain.com/api',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            username: { type: 'string', minLength: 3, maxLength: 50 },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['super_admin', 'user_admin'] },
            isActive: { type: 'boolean' },
            restrictions: {
              type: 'object',
              properties: {
                maxArticles: { type: 'number' },
                canDelete: { type: 'boolean' },
                canEdit: { type: 'boolean' },
                allowedDomains: { type: 'array', items: { type: 'string' } }
              }
            },
            stats: {
              type: 'object',
              properties: {
                totalArticles: { type: 'number' },
                lastLogin: { type: 'string', format: 'date-time' },
                loginCount: { type: 'number' }
              }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Domain: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string', maxLength: 100 },
            url: { type: 'string', format: 'uri' },
            description: { type: 'string', maxLength: 500 },
            isActive: { type: 'boolean' },
            settings: {
              type: 'object',
              properties: {
                indexationKey: { type: 'string' },
                indexationBoost: { type: 'number', minimum: 0, maximum: 100 },
                theme: { type: 'string', enum: ['light', 'dark', 'auto'] },
                commentsEnabled: { type: 'boolean' }
              }
            },
            stats: {
              type: 'object',
              properties: {
                totalArticles: { type: 'number' },
                totalViews: { type: 'number' },
                totalLikes: { type: 'number' }
              }
            },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Article: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            title: { type: 'string', maxLength: 200 },
            slug: { type: 'string' },
            content: { type: 'string' },
            excerpt: { type: 'string', maxLength: 500 },
            category: { 
              type: 'string', 
              enum: ['Crypto', 'Cryptocurrencies', 'Bitcoin', 'Ethereum', 'Technology', 'Politics', 'Economy', 'Sports', 'Entertainment', 'Science', 'Health', 'Business', 'World', 'Local', 'Opinion', 'Other']
            },
            tags: { type: 'array', items: { type: 'string' } },
            hashtags: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['draft', 'published', 'scheduled', 'archived'] },
            author: { type: 'string' },
            domain: { type: 'string' },
            stats: {
              type: 'object',
              properties: {
                views: {
                  type: 'object',
                  properties: {
                    real: { type: 'number' },
                    fake: { type: 'number' },
                    total: { type: 'number' }
                  }
                },
                likes: {
                  type: 'object',
                  properties: {
                    real: { type: 'number' },
                    fake: { type: 'number' },
                    total: { type: 'number' }
                  }
                }
              }
            },
            publishedAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            error: { type: 'object' }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'object' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./routes/*.js', './models/*.js']
};

const specs = swaggerJSDoc(options);

module.exports = (app) => {
  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'BackNews API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true
    }
  }));
  
  // JSON endpoint for API specification
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
}; 