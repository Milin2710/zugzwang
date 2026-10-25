import test, { mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import User from "../src/models/User.js";
import Game from "../src/models/Game.js";
import { createApp } from "../src/app.js";
import { createUserService } from "../src/services/users.js";
import { createHistoryService } from "../src/services/history.js";
import { createPersistence } from "../src/services/persistence.js";
import PositionStat from "../src/models/PositionStat.js";
import BotGame from "../src/models/BotGame.js";
import { createBotGameService } from "../src/services/botGames.js";
import { createLeaderboardService } from "../src/services/leaderboard.js";
import { createExplorerService } from "../src/services/explorer.js";
import { testConfig, silentLogger } from "./helpers.js";

// These tests stub the Mongoose models (no MongoDB needed): they check the wiring —
// auth gating, validation, query shapes and DTO mapping — not Mongo itself.
const chain = (value, calls = {}) => {
  const c = {
    select: () => c, lean: () => c,
    sort: (x) => ((calls.sort = x), c),
    skip: (n) => ((calls.skip = n), c),
    limit: (n) => ((calls.limit = n), c),
    then: (res, rej) => Promise.resolve(value).then(res, rej),
  };
  return c;
};
const clerkAuth = {
  verify: async (t) => { if (t !== "good") throw new Error("bad"); return { clerkId: "clerk_1" }; },
  getProfile: async () => ({ username: "alice", email: "a@x.io", profilePhoto: "p.png" }),
};

let server, base;
async function boot() {
  const users = createUserService({ clerkAuth });
  const app = createApp({
    config: testConfig, clerkAuth, users, history: createHistoryService(), logger: silentLogger,
    leaderboard: createLeaderboardService(), explorer: createExplorerService(), lobby: async () => ({ waiting: 2, playing: 5 }), botGames: createBotGameService(),
  });
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
}
afterEach(async () => { mock.restoreAll(); await new Promise((r) => (server ? server.close(r) : r())); server = null; });
const get = (path, token = "good") => fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

test("health is public; everything else needs a valid token", async () => {
  await boot();
  assert.equal((await get("/health", null)).status, 200);
  assert.equal((await get("/api/users/alice", null)).status, 401);
  assert.equal((await get("/api/users/alice", "forged")).status, 401);
  assert.equal((await get("/api/users/search?q=a", null)).status, 401);
});

test("rejects malformed usernames and empty search before touching the database", async () => {
  mock.method(User, "findOne", () => chain({ _id: 1, username: "alice", usernameLower: "alice", rating: 1200 }));
  await boot();
  assert.equal((await get("/api/users/bad%20name!")).status, 400);
  assert.equal((await get("/api/users/search?q=")).status, 400);
});

test("search escapes regex characters and anchors to a prefix on the indexed lowercase field", async () => {
  let filter;
  mock.method(User, "findOne", () => chain({ username: "alice", usernameLower: "alice" })); // auth user
  mock.method(User, "find", (f) => { filter = f; return chain([{ username: "Alice" }]); });
  await boot();
  const res = await get("/api/users/search?q=" + encodeURIComponent("Al.*(x"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), ["Alice"]);
  assert.equal(filter.usernameLower.source, "^al\\.\\*\\(x"); // no ReDoS / injection, lower-cased
});

test("profile: stats and recent games are mapped from the stored result", async () => {
  const game = (o) => ({ gameId: "g" + Math.random(), white: "alice", black: "bob", whiteRating: 1200, blackRating: 1200, whiteDelta: 16, blackDelta: -16,
    moves: [{ san: "e4" }, { san: "e5" }], finalFen: "x", result: "1-0", reason: "resignation", endedAt: new Date(), ...o });
  mock.method(User, "findOne", (f) => chain(f.username === "alice" || f.clerkId ? { username: "alice", usernameLower: "alice", rating: 1216, lastOnline: new Date() } : null));
  mock.method(Game, "find", () => chain([game({}), game({ white: "bob", black: "alice", result: "1-0", whiteDelta: 16, blackDelta: -16 })]));
  const counts = [3, 2, 1]; // total, wins, draws (Promise.all order)
  mock.method(Game, "countDocuments", () => Promise.resolve(counts.shift()));
  await boot();
  const body = await (await get("/api/users/alice")).json();
  assert.deepEqual(body.stats, { wins: 2, draws: 1, losses: 0 });
  assert.equal(body.gamesPlayed, 3);
  assert.deepEqual(body.recentGames.map((g) => g.outcome), ["win", "loss"]);
  assert.deepEqual(body.recentGames[1].ratingDelta, -16);
  assert.deepEqual(body.recentGames[0].moves, ["e4", "e5"]);
});

test("unknown user -> 404", async () => {
  mock.method(User, "findOne", (f) => chain(f.clerkId ? { username: "alice", usernameLower: "alice" } : null));
  await boot();
  assert.equal((await get("/api/users/ghost")).status, 404);
});

test("persistence applies ratings once: duplicate insert + lost claim = no second $inc", async () => {
  const bulk = mock.method(User, "bulkWrite", async () => ({}));
  const explorerBulk = mock.method(PositionStat, "bulkWrite", async () => ({}));
  const rec = {
    gameId: "g1", white: "a", black: "b", whiteDelta: 16, blackDelta: -16, result: "1-0",
    moves: [{ from: "e2", to: "e4", san: "e4" }, { from: "e7", to: "e5", san: "e5" }],
  };

  mock.method(Game, "create", async () => ({}));
  const claim = mock.method(Game, "updateOne", async () => ({ modifiedCount: 1 }));
  await createPersistence().saveFinishedGame(rec);
  assert.equal(bulk.mock.callCount(), 1);
  assert.equal(explorerBulk.mock.callCount(), 1);
  // winner/loser counters ride along with the rating change
  const [whiteOp, blackOp] = bulk.mock.calls[0].arguments[0];
  assert.deepEqual(whiteOp.updateOne.update.$inc, { rating: 16, gamesPlayed: 1, wins: 1 });
  assert.deepEqual(blackOp.updateOne.update.$inc, { rating: -16, gamesPlayed: 1, losses: 1 });

  // retry of the same game: unique index rejects the insert (E11000) and the claim is already taken
  mock.method(Game, "create", async () => { throw Object.assign(new Error("dup"), { code: 11000 }); });
  claim.mock.mockImplementation(async () => ({ modifiedCount: 0 }));
  await createPersistence().saveFinishedGame(rec);
  assert.equal(bulk.mock.callCount(), 1, "ratings must not be applied twice");
  assert.equal(explorerBulk.mock.callCount(), 1, "explorer stats must not be counted twice");

  // any other DB error propagates so the service can retry
  mock.method(Game, "create", async () => { throw new Error("connection lost"); });
  await assert.rejects(createPersistence().saveFinishedGame(rec), /connection lost/);
});

test("users created before usernameLower existed are backfilled on first sight (so search finds them)", async () => {
  const legacy = { clerkId: "clerk_1", username: "firstuser" }; // no usernameLower
  const modern = { clerkId: "clerk_2", username: "Bob", usernameLower: "bob" };
  const updates = [];
  mock.method(User, "findOne", (f) => chain(f.clerkId === "clerk_1" ? legacy : modern));
  mock.method(User, "findOneAndUpdate", async (_f, update) => { updates.push(update); return { ...legacy, ...update.$set }; });
  const users = createUserService({ clerkAuth: { ...clerkAuth, getProfile: async () => ({ username: "firstuser", email: "e@x.io", profilePhoto: "p" }) } });

  const refreshed = await users.ensure("clerk_1");
  assert.equal(updates.length, 1);
  assert.equal(refreshed.usernameLower, "firstuser");
  assert.equal(updates[0].$set.usernameLower, "firstuser");

  await users.ensure("clerk_2"); // already migrated: no extra Clerk/DB write
  assert.equal(updates.length, 1);
});

test("history is paginated: page/limit are clamped and totals drive the page count", async () => {
  const calls = {};
  mock.method(User, "findOne", () => chain({ username: "alice", usernameLower: "alice", rating: 1200 }));
  mock.method(Game, "find", () => chain([], calls));
  mock.method(Game, "countDocuments", async () => 23);
  await boot();
  let body = await (await get("/api/users/alice/games?page=3&limit=5")).json();
  assert.deepEqual([calls.skip, calls.limit], [10, 5]);
  assert.deepEqual([body.page, body.pages, body.total], [3, 5, 23]);
  body = await (await get("/api/users/alice/games?page=0&limit=999")).json();
  assert.deepEqual([calls.skip, calls.limit, body.page], [0, 50, 1]);
  body = await (await get("/api/users/alice/games?page=abc")).json();
  assert.equal(body.page, 1);
});

test("leaderboard: ordered by rating, ties share a rank, ranks continue across pages", async () => {
  const calls = {};
  const rows = [
    { username: "a", rating: 1300, gamesPlayed: 4, wins: 3, draws: 0, losses: 1 },
    { username: "b", rating: 1300, gamesPlayed: 2, wins: 2, draws: 0, losses: 0 },
    { username: "c", rating: 1250, gamesPlayed: 1, wins: 1, draws: 0, losses: 0 },
    { username: "d", rating: 1200, gamesPlayed: 9, wins: 4, draws: 1, losses: 4 },
  ];
  const me = { username: "alice", usernameLower: "alice", rating: 1250, gamesPlayed: 3 };
  mock.method(User, "findOne", () => chain(me));
  mock.method(User, "find", () => chain(rows, calls));
  // countDocuments is called for: total, players above the first row, players above me (Promise.all order)
  const answers = { total: 45, aboveFirst: 20, aboveMe: 22 };
  mock.method(User, "countDocuments", async (q) =>
    !q.rating ? answers.total : q.rating.$gt === 1300 ? answers.aboveFirst : answers.aboveMe);
  await boot();
  const body = await (await get("/api/leaderboard?page=2&limit=20")).json();
  assert.deepEqual(calls.sort, { rating: -1, usernameLower: 1 });
  assert.equal(calls.skip, 20);
  assert.deepEqual(body.players.map((p) => [p.username, p.rank]), [["a", 21], ["b", 21], ["c", 23], ["d", 24]]);
  assert.deepEqual([body.total, body.pages, body.page], [45, 3, 2]);
  assert.deepEqual(body.me, { rank: 23, rating: 1250 });
});

test("explorer: most-played moves first, with results; invalid FEN is a 400; default is the start position", async () => {
  let filter;
  mock.method(User, "findOne", () => chain({ username: "alice", usernameLower: "alice" }));
  mock.method(PositionStat, "find", (f) => {
    filter = f;
    return chain([{ san: "e4", games: 7, white: 4, draws: 1, black: 2 }, { san: "d4", games: 3, white: 1, draws: 1, black: 1 }]);
  });
  await boot();
  const body = await (await get("/api/explorer")).json();
  assert.equal(filter.pos, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -"); // counters stripped
  assert.equal(body.total, 10);
  assert.deepEqual(body.moves.map((m) => m.san), ["e4", "d4"]);
  assert.equal((await get("/api/explorer?fen=" + encodeURIComponent("not a fen"))).status, 400);
});

test("lobby stats are exposed", async () => {
  mock.method(User, "findOne", () => chain({ username: "alice", usernameLower: "alice" }));
  await boot();
  assert.deepEqual(await (await get("/api/stats")).json(), { waiting: 2, playing: 5 });
});

const post = (path, body, token = "good") =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

const FOOLS_MATE = ["f2f3", "e7e5", "g2g4", "d8h4"]; // black mates: 0-1
const fresh = (over = {}) => ({ clientId: "client-abc-123", color: "white", level: 5, moves: FOOLS_MATE, ...over });

test("bot games: the server replays the moves and decides the result itself", async () => {
  let saved;
  mock.method(User, "findOne", () => chain({ username: "alice", usernameLower: "alice" }));
  mock.method(BotGame, "create", async (doc) => ((saved = doc), { ...doc, _id: "b1", endedAt: new Date() }));
  await boot();
  const res = await post("/api/bot-games", fresh({ result: "1-0", outcome: "win" })); // lies are ignored
  assert.equal(res.status, 201);
  assert.equal(saved.username, "alice");
  assert.deepEqual([saved.result, saved.outcome, saved.reason], ["0-1", "loss", "checkmate"]);
  assert.equal(saved.moves[3].san, "Qh4#");
  assert.match(saved.finalFen, /^rnb1kbnr\/pppp1ppp\/8\/4p3\/6Pq\//);
});

test("bot games: rejects illegal lines, unfinished games and bad input", async () => {
  mock.method(User, "findOne", () => chain({ username: "alice", usernameLower: "alice" }));
  const create = mock.method(BotGame, "create", async () => ({}));
  await boot();
  assert.equal((await post("/api/bot-games", fresh({ moves: ["e2e5"] }))).status, 400); // illegal
  assert.equal((await post("/api/bot-games", fresh({ moves: ["e2e4", "e7e5"] }))).status, 400); // not finished
  assert.equal((await post("/api/bot-games", fresh({ moves: ["e2e4", "e7e5"], resigned: "yes" }))).status, 400);
  assert.equal((await post("/api/bot-games", fresh({ moves: ["e2e4"], resigned: true }))).status, 400); // too short to resign
  assert.equal((await post("/api/bot-games", fresh({ moves: [] }))).status, 400);
  assert.equal((await post("/api/bot-games", fresh({ moves: Array(601).fill("e2e4") }))).status, 400);
  assert.equal((await post("/api/bot-games", fresh({ level: 25 }))).status, 400);
  assert.equal((await post("/api/bot-games", fresh({ color: "green" }))).status, 400);
  assert.equal((await post("/api/bot-games", fresh({ clientId: "x" }))).status, 400);
  assert.equal((await post("/api/bot-games", fresh(), null)).status, 401);
  assert.equal(create.mock.callCount(), 0);
});

test("bot games: resigning counts as a computer win; a retried save returns the original", async () => {
  mock.method(User, "findOne", () => chain({ username: "alice", usernameLower: "alice" }));
  const create = mock.method(BotGame, "create", async (doc) => {
    if (create.mock.callCount() > 0) throw Object.assign(new Error("dup"), { code: 11000 });
    return { ...doc, _id: "b1", endedAt: new Date() };
  });
  mock.method(BotGame, "findOne", () => chain({ _id: "b1", level: 5, color: "black", outcome: "loss", result: "1-0", reason: "resignation", moves: [], finalFen: "x", endedAt: new Date() }));
  await boot();
  const body = fresh({ color: "black", moves: ["e2e4", "e7e5"], resigned: true });
  const first = await (await post("/api/bot-games", body)).json();
  assert.deepEqual([first.outcome, first.reason, first.result], ["loss", "resignation", "1-0"]);
  const again = await post("/api/bot-games", body);
  assert.equal(again.status, 201);
  assert.equal((await again.json()).id, "b1");
});

test("bot games are private and walled off from everything public", async () => {
  const calls = {};
  const bot = mock.method(BotGame, "find", () => chain([], calls));
  mock.method(BotGame, "countDocuments", async () => 0);
  mock.method(User, "findOne", () => chain({ username: "alice", usernameLower: "alice", rating: 1200, gamesPlayed: 0 }));
  mock.method(Game, "find", () => chain([]));
  mock.method(Game, "countDocuments", async () => 0);
  mock.method(User, "find", () => chain([]));
  mock.method(User, "countDocuments", async () => 0);
  mock.method(PositionStat, "find", () => chain([]));
  await boot();
  // the public/other-user endpoints never read bot games
  await get("/api/users/bob"); await get("/api/users/bob/games"); await get("/api/leaderboard"); await get("/api/explorer");
  assert.equal(bot.mock.callCount(), 0);
  // the list is always the caller's own, whatever is asked for
  const body = await (await get("/api/bot-games?page=2&limit=5&username=bob")).json();
  assert.equal(bot.mock.callCount(), 1);
  assert.deepEqual(bot.mock.calls[0].arguments[0], { username: "alice" });
  assert.deepEqual([calls.skip, calls.limit, body.page], [5, 5, 2]);
});
