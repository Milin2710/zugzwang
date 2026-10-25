import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createRouter } from "./routes/index.js";
import { errorHandler } from "./middleware/auth.js";

export function createApp({ config, clerkAuth, users, history, leaderboard, explorer, lobby, botGames, logger }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "10kb" }));
  app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
  app.use(createRouter({ clerkAuth, users, history, leaderboard, explorer, lobby, botGames }));
  app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
  app.use(errorHandler(logger));
  return app;
}
