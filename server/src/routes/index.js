import express from "express";
import { requireUser } from "../middleware/auth.js";
import { AppError } from "../services/users.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const USERNAME = /^[A-Za-z0-9._-]{1,40}$/;

/** ?page= (1-based) and ?limit= with sane bounds. */
function pageParams(req, { defaultLimit }) {
  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 100_000);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || defaultLimit, 1), 50);
  return { page, limit };
}

export function createRouter({ clerkAuth, users, history, leaderboard, explorer, lobby, botGames }) {
  const router = express.Router();
  const auth = requireUser({ clerkAuth, users });

  router.get("/health", (_req, res) => res.send("OK"));

  // Called by the client after sign-in. Profile data comes from Clerk, not the request body.
  router.post("/api/users/sync", auth, (req, res) => {
    const u = req.user;
    res.json({ username: u.username, rating: u.rating, profilePhoto: u.profilePhoto });
  });

  router.get("/api/users/search", auth, async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q.trim()) throw new AppError(400, "BAD_REQUEST", "q is required");
    res.json(await users.search(q));
  });

  const validUsername = (req) => {
    const { username } = req.params;
    if (!USERNAME.test(username)) throw new AppError(400, "BAD_REQUEST", "Invalid username");
    return username;
  };

  router.get("/api/users/:username", auth, async (req, res) => {
    res.json(await history.profile(validUsername(req)));
  });

  router.get("/api/users/:username/games", auth, async (req, res) => {
    const username = validUsername(req);
    res.json(await history.games(username, pageParams(req, { defaultLimit: 10 })));
  });

  router.get("/api/leaderboard", auth, async (req, res) => {
    const [board, me] = await Promise.all([leaderboard.page(pageParams(req, { defaultLimit: 20 })), leaderboard.rankOf(req.user)]);
    res.json({ ...board, me });
  });

  router.get("/api/explorer", auth, async (req, res) => {
    const fen = typeof req.query.fen === "string" && req.query.fen.length <= 100 ? req.query.fen : START_FEN;
    res.json(await explorer.lookup(fen));
  });

  // Practice games vs the computer: private to the signed-in user, never rated, never in the explorer.
  router.post("/api/bot-games", auth, async (req, res) => {
    res.status(201).json(await botGames.save(req.user.username, req.body));
  });

  router.get("/api/bot-games", auth, async (req, res) => {
    res.json(await botGames.list(req.user.username, pageParams(req, { defaultLimit: 10 })));
  });

  router.get("/api/stats", auth, async (_req, res) => {
    res.json(lobby ? await lobby() : { waiting: 0, playing: 0 });
  });

  return router;
}
