import test, { before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { io as connect } from "socket.io-client";
import { createClient } from "redis";
import { createIo, createEmitter } from "../src/sockets/io.js";
import { registerHandlers } from "../src/sockets/handlers.js";
import { GameStore } from "../src/services/gameStore.js";
import { createGameService } from "../src/services/gameService.js";
import { connectRedis, flush, fakePersistence, silentLogger, testConfig, REDIS_URL } from "./helpers.js";

// ---- two complete server instances sharing one Redis (like 2 ports in production) ----
const fakeAuth = { verify: async (t) => { if (!t?.startsWith("tok_")) throw new Error("bad"); return { clerkId: t.slice(4) }; } };
const ratings = { alice: 1200, bob: 1200 };
const fakeUsers = {
  ensure: async (clerkId) => ({ username: clerkId }),
  getRating: async (u) => ratings[u] ?? 1200,
  touchLastOnline: async () => {},
};

async function bootInstance(persistence, config) {
  const redis = await connectRedis();
  const pub = createClient({ url: REDIS_URL });
  pub.on("error", () => {});
  await pub.connect();
  const sub = pub.duplicate();
  sub.on("error", () => {});
  await sub.connect();
  const server = http.createServer();
  const io = createIo(server, { corsOrigins: ["*"], adapterPub: pub, adapterSub: sub, clerkAuth: fakeAuth, users: fakeUsers, logger: silentLogger });
  const emitter = createEmitter(io);
  const store = new GameStore(redis, config.game);
  const service = createGameService({ store, persistence, emitter, config, logger: silentLogger });
  registerHandlers(io, { service, users: fakeUsers, emitter, logger: silentLogger });
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  return {
    url, service,
    async close() { io.close(); server.close(); await Promise.all([redis.quit(), pub.quit(), sub.quit()]); },
  };
}

const client = (url, user) =>
  connect(url, { auth: { token: `tok_${user}` }, transports: ["websocket"], reconnection: false, forceNew: true });

const once = (socket, event, pred = () => true, ms = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    const handler = (p) => { if (pred(p)) { clearTimeout(timer); socket.off(event, handler); resolve(p); } };
    socket.on(event, handler);
  });

let redis, persistence, s1, s2;
const sockets = [];
const open = (url, user) => { const s = client(url, user); sockets.push(s); return s; };

before(async () => {
  redis = await connectRedis();
  persistence = fakePersistence();
  s1 = await bootInstance(persistence, testConfig);
  s2 = await bootInstance(persistence, testConfig);
});
after(async () => {
  sockets.forEach((s) => s.close());
  await s1.close(); await s2.close(); await redis.quit();
});
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.close());
  await new Promise((r) => setTimeout(r, 100)); // let server-side disconnect handlers finish
});
beforeEach(async () => { await flush(redis); persistence.saved.length = 0; });

test("rejects unauthenticated sockets", async () => {
  const s = connect(s1.url, { auth: {}, transports: ["websocket"], reconnection: false, forceNew: true });
  sockets.push(s);
  const err = await once(s, "connect_error");
  assert.equal(err.message, "UNAUTHORIZED");
});

test("players on DIFFERENT servers pair up, play, get mated and see the result", async () => {
  const a = open(s1.url, "alice");
  const b = open(s2.url, "bob");
  await Promise.all([once(a, "session:ready"), once(b, "session:ready")]);

  const aState = once(a, "game:state", (g) => g.status === "active");
  const bState = once(b, "game:state", (g) => g.status === "active");
  a.emit("queue:join");
  await once(a, "queue:waiting");
  b.emit("queue:join");
  const [ga, gb] = await Promise.all([aState, bState]);
  assert.equal(ga.id, gb.id);
  const whiteIsAlice = ga.white.username === "alice";
  const W = whiteIsAlice ? a : b, B = whiteIsAlice ? b : a;

  // illegal + out-of-turn are refused with an error, and the sender gets the real state back
  B.emit("game:move", { from: "e7", to: "e5" });
  assert.equal((await once(B, "game:error")).code, "NOT_YOUR_TURN");
  W.emit("game:move", { from: "e2", to: "e5" });
  assert.equal((await once(W, "game:error")).code, "ILLEGAL_MOVE");
  W.emit("game:move", { from: "zz", to: "e5" });
  assert.equal((await once(W, "game:error")).code, "BAD_PAYLOAD");

  // a real move on one server shows up on the other server's client
  const seen = once(B, "game:state", (g) => g.moves.length === 1);
  W.emit("game:move", { from: "f2", to: "f3" });
  assert.equal((await seen).moves[0].san, "f3");

  const overA = once(a, "game:over");
  const overB = once(b, "game:over");
  B.emit("game:move", { from: "e7", to: "e5" });
  await once(W, "game:state", (g) => g.moves.length === 2);
  W.emit("game:move", { from: "g2", to: "g4" });
  await once(B, "game:state", (g) => g.moves.length === 3);
  B.emit("game:move", { from: "d8", to: "h4" });
  const [oa, ob] = await Promise.all([overA, overB]);
  assert.equal(oa.reason, "checkmate");
  assert.equal(oa.winner, "black"); // fool's mate: white is mated
  assert.deepEqual(oa, ob);
  assert.equal(persistence.saved.length, 1);
});

test("refresh/reconnect to a different server resumes the same game", async () => {
  const a = open(s1.url, "alice");
  const b = open(s2.url, "bob");
  await Promise.all([once(a, "session:ready"), once(b, "session:ready")]);
  const started = once(a, "game:state", (g) => g.status === "active");
  a.emit("queue:join"); await once(a, "queue:waiting");
  b.emit("queue:join");
  const g = await started;
  const aIsWhite = g.white.username === "alice";

  // alice's tab is closed...
  const sawGone = once(b, "game:state", (s) => s.disconnect.white || s.disconnect.black);
  a.close();
  const dc = await sawGone;
  assert.ok(dc.disconnect[aIsWhite ? "white" : "black"], "opponent is told alice left, with a deadline");

  // ...and reopened on the OTHER server
  const backP = once(b, "game:state", (s) => !s.disconnect.white && !s.disconnect.black);
  const a2 = open(s2.url, "alice");
  const ready = await once(a2, "session:ready");
  assert.equal(ready.game.id, g.id);
  assert.equal((await backP).status, "active"); // opponent is told alice is back
});

test("resign + draw buttons work over the wire", async () => {
  const a = open(s1.url, "alice");
  const b = open(s2.url, "bob");
  await Promise.all([once(a, "session:ready"), once(b, "session:ready")]);
  const started = once(a, "game:state", (g) => g.status === "active");
  a.emit("queue:join"); await once(a, "queue:waiting");
  b.emit("queue:join");
  const g = await started;
  const W = g.white.username === "alice" ? a : b;
  const B = W === a ? b : a;
  W.emit("game:move", { from: "e2", to: "e4" });
  await once(B, "game:state", (s) => s.moves.length === 1);
  B.emit("game:move", { from: "e7", to: "e5" });
  await once(W, "game:state", (s) => s.moves.length === 2);

  W.emit("draw:offer");
  const offered = await once(B, "game:state", (s) => s.drawOffer === "white");
  assert.equal(offered.drawOffer, "white");
  B.emit("draw:decline");
  await once(W, "game:state", (s) => s.drawOffer === null);

  const over = once(W, "game:over");
  B.emit("game:resign");
  const res = await over;
  assert.equal(res.reason, "resignation");
  assert.equal(res.winner, "white");
});
