import { createClerkClient, verifyToken } from "@clerk/backend";

/**
 * Thin wrapper over Clerk so the rest of the app depends on a 2-method interface
 * ({ verify, getProfile }) that tests can replace with a fake.
 */
export function createClerkAuth({ secretKey, authorizedParties, jwtKey }) {
  const clerk = createClerkClient({ secretKey });
  return {
    /** @returns {Promise<{ clerkId: string }>} throws if the token is missing/invalid/expired */
    async verify(token) {
      if (!token || typeof token !== "string") throw new Error("Missing token");
      // The installed @clerk/backend returns the claims directly and THROWS on failure, although its
      // type definitions describe a { data, errors } wrapper. Accept both so a version bump can't break auth.
      const result = await verifyToken(token, { secretKey, authorizedParties, ...(jwtKey ? { jwtKey } : {}) });
      if (result?.errors?.length) throw result.errors[0];
      const claims = result?.data ?? result;
      if (!claims?.sub) throw new Error("Token has no subject");
      return { clerkId: claims.sub };
    },
    /** Trusted profile data, straight from Clerk (never from the client). */
    async getProfile(clerkId) {
      const u = await clerk.users.getUser(clerkId);
      return {
        username: u.username,
        email: u.primaryEmailAddress?.emailAddress ?? u.emailAddresses?.[0]?.emailAddress ?? "",
        profilePhoto: u.imageUrl,
      };
    },
  };
}
