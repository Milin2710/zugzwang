import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { createClerkAuth } from "../src/auth/clerk.js";

// Real RS256 tokens verified by the real @clerk/backend (networkless, via jwtKey).
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = publicKey.export({ type: "spki", format: "pem" });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function sign(claims, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "RS256", typ: "JWT", kid: "ins_test" });
  const body = b64({ sub: "user_123", azp: "http://localhost:3000", iat: now - 5, nbf: now - 5, exp: now + 60, iss: "https://x.clerk.accounts.dev", sid: "s1", ...claims });
  return `${head}.${body}.${createSign("RSA-SHA256").update(`${head}.${body}`).sign(key, "base64url")}`;
}
const auth = createClerkAuth({ secretKey: "sk_test_x", jwtKey: pem, authorizedParties: ["http://localhost:3000"] });

test("a valid Clerk session token yields the clerkId", async () => {
  assert.deepEqual(await auth.verify(sign({})), { clerkId: "user_123" });
});

test("rejects: missing, garbage, expired, wrong origin, forged signature", async () => {
  await assert.rejects(auth.verify(undefined), /Missing token/);
  await assert.rejects(auth.verify("not.a.jwt"));
  const now = Math.floor(Date.now() / 1000);
  await assert.rejects(auth.verify(sign({ iat: now - 300, nbf: now - 300, exp: now - 100 })));
  await assert.rejects(auth.verify(sign({ azp: "http://evil.example" })), /Authorized party/);
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  await assert.rejects(auth.verify(sign({}, other)));
});
