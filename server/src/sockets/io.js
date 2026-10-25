import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";

export const userRoom = (username) => `user:${username}`;

/**
 * Socket.IO server. With the Redis adapter, io.to(room).emit / fetchSockets work
 * across every server instance, so a player can be connected to any of them.
 */
export function createIo(httpServer, { corsOrigins, adapterPub, adapterSub, clerkAuth, users, logger }) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    maxHttpBufferSize: 10_000, // game payloads are tiny; refuse anything big
  });
  if (adapterPub && adapterSub) io.adapter(createAdapter(adapterPub, adapterSub));

  // Authenticate the handshake. The username comes from the verified Clerk token,
  // never from anything the client sends.
  io.use(async (socket, next) => {
    try {
      const { clerkId } = await clerkAuth.verify(socket.handshake.auth?.token);
      const user = await users.ensure(clerkId);
      socket.data.user = { clerkId, username: user.username };
      next();
    } catch (err) {
      logger.warn("socket auth rejected", { reason: err.message, origin: socket.handshake.headers.origin });
      next(new Error("UNAUTHORIZED"));
    }
  });
  return io;
}

export function createEmitter(io) {
  return {
    toUser: (username, event, payload) => io.to(userRoom(username)).emit(event, payload),
    userSocketCount: async (username) => (await io.in(userRoom(username)).fetchSockets()).length,
  };
}
