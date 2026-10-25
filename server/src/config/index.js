import "dotenv/config";

const int = (name, fallback) => {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Env ${name} must be a number`);
  return n;
};

const list = (name, fallback) =>
  (process.env[name] ?? fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  port: int("PORT", 4000),
  corsOrigins: list("CORS_ORIGINS", "http://localhost:3000"),
  mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/chessing",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  clerkSecretKey: process.env.CLERK_SECRET_KEY || "",
  // Optional: Clerk "JWT public key" (PEM). Lets the server verify tokens without calling Clerk.
  clerkJwtKey: (process.env.CLERK_JWT_KEY || "").replace(/\\n/g, "\n") || undefined,

  game: {
    // Time control: initial time + increment per move (ms)
    initialMs: int("TIME_CONTROL_MS", 10 * 60 * 1000),
    incrementMs: int("TIME_INCREMENT_MS", 0),
    // Time allowed for each side's very first move before the game is aborted
    firstMoveMs: int("FIRST_MOVE_MS", 30 * 1000),
    // How long a disconnected player has to come back before forfeiting
    disconnectGraceMs: int("DISCONNECT_GRACE_MS", 30 * 1000),
    // Finished games stay in Redis this long so clients can still sync the result
    finishedTtlSec: int("FINISHED_GAME_TTL_SEC", 3600),
    // Safety net so orphaned keys can never live forever
    activeTtlSec: int("ACTIVE_GAME_TTL_SEC", 24 * 3600),
  },

  matchmaking: {
    baseWindow: int("MM_BASE_WINDOW", 100), // rating points
    windowGrowthPerSec: int("MM_WINDOW_GROWTH", 20), // extra points per second waited
  },

  rating: {
    initial: 1200,
    kFactor: int("ELO_K", 32),
    floor: 100,
  },

  sweepIntervalMs: int("SWEEP_INTERVAL_MS", 1000),
};

export function assertProductionConfig() {
  if (!config.clerkSecretKey) {
    throw new Error("CLERK_SECRET_KEY is required (server verifies Clerk session tokens)");
  }
}
