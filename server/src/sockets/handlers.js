import { userRoom } from "./io.js";

const SQUARE = /^[a-h][1-8]$/;
const isMove = (p) =>
  p && typeof p === "object" && SQUARE.test(p.from) && SQUARE.test(p.to) &&
  (p.promotion === undefined || /^[qrbn]$/.test(p.promotion));

/** Token bucket per socket: stops a client flooding events. */
function createLimiter({ capacity = 20, refillPerSec = 10 } = {}) {
  let tokens = capacity;
  let last = Date.now();
  return () => {
    const t = Date.now();
    tokens = Math.min(capacity, tokens + ((t - last) / 1000) * refillPerSec);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

export function registerHandlers(io, { service, users, emitter, logger }) {
  io.on("connection", async (socket) => {
    const { username } = socket.data.user;
    const allow = createLimiter();
    socket.join(userRoom(username));

    /** Wrap every handler: rate limit + never let an exception crash the process. */
    const on = (event, handler) =>
      socket.on(event, async (payload) => {
        if (!allow()) return socket.emit("game:error", { action: event, code: "RATE_LIMITED" });
        try {
          await handler(payload);
        } catch (err) {
          logger.error("socket handler failed", { event, username, err });
          socket.emit("game:error", { action: event, code: "SERVER_ERROR" });
        }
      });

    const reply = (action) => (res) => {
      if (res && res.ok === false) socket.emit("game:error", { action, code: res.code });
    };

    // Resume: tells the client who it is and whether a game is already in progress.
    try {
      const game = await service.onUserOnline(username);
      socket.emit("session:ready", { username, game });
    } catch (err) {
      logger.error("session init failed", { username, err });
    }

    on("queue:join", async () => {
      const rating = await users.getRating(username);
      const res = await service.joinQueue({ username, rating, socketId: socket.id });
      if (res.status === "queued") socket.emit("queue:waiting", { rating });
      else if (res.status === "in_game") socket.emit("game:state", await service.getSnapshot(username));
      // "matched": service already pushed game:state to both players
    });

    on("queue:leave", async () => {
      await service.leaveQueue(username);
      socket.emit("queue:left");
    });

    on("game:sync", async () => {
      socket.emit("session:ready", { username, game: await service.getSnapshot(username) });
    });

    on("game:move", async (payload) => {
      if (!isMove(payload)) return socket.emit("game:error", { action: "game:move", code: "BAD_PAYLOAD" });
      const res = await service.makeMove(username, payload);
      if (res.ok === false) {
        socket.emit("game:error", { action: "game:move", code: res.code });
        // Re-send authoritative state so the client's board snaps back.
        const snap = await service.getSnapshot(username);
        if (snap) socket.emit("game:state", snap);
      }
    });

    on("game:resign", async () => reply("game:resign")(await service.resign(username)));
    on("draw:offer", async () => reply("draw:offer")(await service.offerDraw(username)));
    on("draw:accept", async () => reply("draw:accept")(await service.acceptDraw(username)));
    on("draw:decline", async () => reply("draw:decline")(await service.declineDraw(username)));

    socket.on("disconnect", async () => {
      try {
        await service.leaveQueue(username, socket.id);
        // Only start the forfeit countdown when the player has no other tab/socket open.
        if ((await emitter.userSocketCount(username)) === 0) {
          await service.onUserOffline(username);
          await users.touchLastOnline(username);
        }
      } catch (err) {
        logger.error("disconnect handling failed", { username, err });
      }
    });
  });
}

export function startSweeper(service, intervalMs, logger) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await service.sweep();
    } catch (err) {
      logger.error("sweep failed", { err });
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
