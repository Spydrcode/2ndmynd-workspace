export type OpsLogLevel = "info" | "warn" | "error";

export type OpsLogEntry = {
  at: string;
  level: OpsLogLevel;
  message: string;
};

export type OpsLogger = {
  entries: OpsLogEntry[];
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export function createOpsLogger(): OpsLogger {
  const entries: OpsLogEntry[] = [];

  const push = (level: OpsLogLevel, message: string) => {
    const entry: OpsLogEntry = {
      at: new Date().toISOString(),
      level,
      message,
    };
    entries.push(entry);

    if (level === "error") {
      console.error(`[ops:${level}] ${message}`);
      return;
    }
    if (level === "warn") {
      console.warn(`[ops:${level}] ${message}`);
      return;
    }
    console.log(`[ops:${level}] ${message}`);
  };

  return {
    entries,
    info: (message) => push("info", message),
    warn: (message) => push("warn", message),
    error: (message) => push("error", message),
  };
}
