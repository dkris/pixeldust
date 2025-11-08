import winston from 'winston';
import path from 'path';

/**
 * Centralized logging system for all agents
 */
export class Logger {
  private logger: winston.Logger;

  constructor(component: string = 'system') {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
      ),
      defaultMeta: { component },
      transports: [
        // Console output
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, component, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
              return `${timestamp} [${component}] ${level}: ${message} ${metaStr}`;
            })
          ),
        }),
        // File output
        new winston.transports.File({
          filename: path.join(process.cwd(), 'data', 'logs', 'error.log'),
          level: 'error',
        }),
        new winston.transports.File({
          filename: path.join(process.cwd(), 'data', 'logs', 'combined.log'),
        }),
      ],
    });
  }

  info(message: string, meta?: Record<string, any>) {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: Record<string, any>) {
    this.logger.warn(message, meta);
  }

  error(message: string, error?: Error | Record<string, any>) {
    this.logger.error(message, error);
  }

  debug(message: string, meta?: Record<string, any>) {
    this.logger.debug(message, meta);
  }

  child(component: string): Logger {
    const childLogger = new Logger(component);
    return childLogger;
  }
}

export default Logger;
