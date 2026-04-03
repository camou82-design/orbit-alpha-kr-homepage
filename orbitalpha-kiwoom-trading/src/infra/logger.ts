import type { AppConfig } from "./config.js";

type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function parseLevel(s: string): Level {
  const v = s.toLowerCase();
  if (v === "debug" || v === "info" || v === "warn" || v === "error") return v;
  return "info";
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function createLogger(config: AppConfig): Logger {
  const min = ORDER[parseLevel(config.logLevel)];

  function log(level: Level, args: unknown[]): void {
    if (ORDER[level] < min) return;
    const prefix = `[${config.appName}] [${level.toUpperCase()}]`;
    const line = [prefix, ...args];
    switch (level) {
      case "debug":
        console.log(...line);
        break;
      case "info":
        console.info(...line);
        break;
      case "warn":
        console.warn(...line);
        break;
      case "error":
        console.error(...line);
        break;
    }
  }

  return {
    debug: (...args: unknown[]) => log("debug", args),
    info: (...args: unknown[]) => log("info", args),
    warn: (...args: unknown[]) => log("warn", args),
    error: (...args: unknown[]) => log("error", args),
  };
}
