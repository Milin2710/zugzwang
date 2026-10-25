import { io, Socket } from "socket.io-client";

/**
 * One authenticated socket per play session.
 * `auth` is a function so every (re)connect attempt sends a FRESH Clerk token
 * (session tokens expire after ~1 minute).
 */
export function createGameSocket(getToken: () => Promise<string | null>): Socket {
  return io(process.env.NEXT_PUBLIC_BACKEND_URL as string, {
    transports: ["websocket"],
    auth: (cb) => {
      getToken()
        .then((token) => cb({ token }))
        .catch(() => cb({ token: null }));
    },
  });
}
