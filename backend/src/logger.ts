import path from "path";
import fs from "fs";
import winston from "winston";
import { config } from "./config";

const LOG_DIR = path.join(process.cwd(), "logs");

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    const base = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    return stack ? `${base}\n${stack}` : base;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transports: winston.transport[] = [
  // Console: info and error levels (info shows info, warn, error; we keep it readable)
  new winston.transports.Console({
    level: config.logging.consoleLevel,
    format: consoleFormat,
  }),
];

// File transports: enabled per level via env
if (config.logging.file.info) {
  ensureLogDir();
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, "info.log"),
      level: "info",
      format: fileFormat,
    })
  );
}
if (config.logging.file.debug) {
  ensureLogDir();
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, "debug.log"),
      level: "debug",
      format: fileFormat,
    })
  );
}
if (config.logging.file.error) {
  ensureLogDir();
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, "error.log"),
      level: "error",
      format: fileFormat,
    })
  );
}
if (config.logging.file.warn) {
  ensureLogDir();
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, "warn.log"),
      level: "warn",
      format: fileFormat,
    })
  );
}

export const logger = winston.createLogger({
  level: config.logging.level,
  levels: winston.config.npm.levels,
  transports,
  exitOnError: false,
});
