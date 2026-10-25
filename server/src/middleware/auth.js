import { AppError } from "../services/users.js";
import { logger } from "../utils/logger.js";

/** Verifies the Clerk bearer token and attaches req.user (created on first sight). */
export function requireUser({ clerkAuth, users }) {
  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      let clerkId;
      try {
        ({ clerkId } = await clerkAuth.verify(token));
      } catch (err) {
        // Say WHY (bad secret key, origin not in CORS_ORIGINS, expired token...) so it's debuggable.
        logger.warn("REST auth rejected", { reason: err.message, path: req.path, origin: req.headers.origin });
        throw new AppError(401, "UNAUTHORIZED", "Sign in required");
      }
      req.auth = { clerkId };
      req.user = await users.ensure(clerkId);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (err, _req, res, _next) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: err.code, message: err.message });
    logger.error("unhandled request error", { err });
    res.status(500).json({ error: "SERVER_ERROR", message: "Something went wrong" });
  };
}
