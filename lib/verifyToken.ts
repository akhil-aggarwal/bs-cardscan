import { createRemoteJWKSet, jwtVerify } from "jose";

// Verifies a Firebase Auth ID token without a service account, using Google's public keys.
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export async function verifyFirebaseToken(token: string): Promise<{ uid: string; email: string }> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set");
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  const email = String(payload.email || "").toLowerCase();
  return { uid: String(payload.sub), email };
}

export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Throws a Response-like error message when the token is missing, invalid or not on the allow-list. */
export async function requireAllowedUser(token: string | null | undefined): Promise<{ uid: string; email: string }> {
  if (!token) throw new Error("Please sign in again.");
  let u: { uid: string; email: string };
  try {
    u = await verifyFirebaseToken(token);
  } catch {
    throw new Error("Your login has expired. Please sign in again.");
  }
  const allow = allowedEmails();
  if (allow.length && !allow.includes(u.email)) throw new Error("This account is not allowed.");
  return u;
}
