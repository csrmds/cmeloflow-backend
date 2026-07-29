const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: null, // remove pid e hostname
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
});

module.exports = logger;