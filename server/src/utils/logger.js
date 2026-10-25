// Tiny structured logger. Never log emails, tokens or full user objects.
const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = levels[process.env.LOG_LEVEL || "info"] ?? levels.info;

function log(level, msg, meta) {
  if (levels[level] < threshold) return;
  const line = { t: new Date().toISOString(), level, msg, ...meta };
  const out = level === "error" || level === "warn" ? console.error : console.log;
  out(JSON.stringify(line, (_k, v) => (v instanceof Error ? v.stack : v)));
}

export const logger = {
  debug: (m, meta) => log("debug", m, meta),
  info: (m, meta) => log("info", m, meta),
  warn: (m, meta) => log("warn", m, meta),
  error: (m, meta) => log("error", m, meta),
};
