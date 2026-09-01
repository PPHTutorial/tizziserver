import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma, type SocialProvider } from "@stall/db";
import { env } from "@stall/config";
import { AppError } from "../errors.ts";
import { issueTokenPair, type IssueInput, type TokenPair } from "./tokens.ts";
import { activeRolesFor } from "./identity.ts";

interface SocialProfile {
  providerUserId: string;
  email?: string;
  name?: string;
}

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

async function verifyGoogle(idToken: string): Promise<SocialProfile> {
  if (!env.GOOGLE_CLIENT_ID) throw new AppError("VALIDATION", "Google sign-in is not configured");
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.GOOGLE_CLIENT_ID,
  }).catch(() => {
    throw new AppError("INVALID_TOKEN", "Google ID token rejected");
  });
  return { providerUserId: String(payload.sub), email: payload.email as string | undefined, name: payload.name as string | undefined };
}

async function verifyApple(idToken: string): Promise<SocialProfile> {
  if (!env.APPLE_CLIENT_ID) throw new AppError("VALIDATION", "Apple sign-in is not configured");
  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: "https://appleid.apple.com",
    audience: env.APPLE_CLIENT_ID,
  }).catch(() => {
    throw new AppError("INVALID_TOKEN", "Apple ID token rejected");
  });
  return { providerUserId: String(payload.sub), email: payload.email as string | undefined };
}

async function verifyFacebook(accessToken: string): Promise<SocialProfile> {
  if (!env.FACEBOOK_CLIENT_ID || !env.FACEBOOK_CLIENT_SECRET) {
    throw new AppError("VALIDATION", "Facebook sign-in is not configured");
  }
  const app = `${env.FACEBOOK_CLIENT_ID}|${env.FACEBOOK_CLIENT_SECRET}`;
  const dbg = (await fetch(
    `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${app}`,
  ).then((r) => r.json())) as { data?: { is_valid?: boolean; app_id?: string } };
  if (!dbg.data?.is_valid || dbg.data.app_id !== env.FACEBOOK_CLIENT_ID) {
    throw new AppError("INVALID_TOKEN", "Facebook access token rejected");
  }
  const me = (await fetch(
    `https://graph.facebook.com/me?fields=id,name,email&access_token=${accessToken}`,
  ).then((r) => r.json())) as { id: string; name?: string; email?: string };
  return { providerUserId: String(me.id), email: me.email, name: me.name };
}

export interface SocialSignInInput extends Omit<IssueInput, "userId"> {
  provider: SocialProvider;
  /** ID token for GOOGLE/APPLE; OAuth access token for FACEBOOK */
  token: string;
}

export async function signInWithSocial(
  input: SocialSignInInput,
): Promise<{ tokens: TokenPair; userId: string; created: boolean }> {
  const profile =
    input.provider === "GOOGLE"
      ? await verifyGoogle(input.token)
      : input.provider === "APPLE"
        ? await verifyApple(input.token)
        : await verifyFacebook(input.token);

  let identity = await prisma.socialIdentity.findUnique({
    where: { provider_providerUserId: { provider: input.provider, providerUserId: profile.providerUserId } },
    include: { user: true },
  });

  let created = false;
  if (!identity) {
    // link to an existing user by verified email, else create a new one
    const existing = profile.email
      ? await prisma.user.findUnique({ where: { email: profile.email.toLowerCase() } })
      : null;
    const user =
      existing ??
      (await prisma.user.create({
        data: {
          phone: `social:${input.provider}:${profile.providerUserId}`, // placeholder until phone is added
          email: profile.email?.toLowerCase(),
          firstName: profile.name?.split(" ")[0],
          status: "ACTIVE",
          roles: { create: { role: "CUSTOMER", status: "ACTIVE", activatedAt: new Date() } },
          tokenEpoch: { create: {} },
        },
      }));
    created = !existing;
    identity = await prisma.socialIdentity.create({
      data: { userId: user.id, provider: input.provider, providerUserId: profile.providerUserId, email: profile.email },
      include: { user: true },
    });
  }

  // make sure the user has at least one ACTIVE role
  if ((await activeRolesFor(identity.userId)).length === 0) {
    await prisma.userRole.upsert({
      where: { userId_role: { userId: identity.userId, role: "CUSTOMER" } },
      create: { userId: identity.userId, role: "CUSTOMER", status: "ACTIVE", activatedAt: new Date() },
      update: { status: "ACTIVE", activatedAt: new Date() },
    });
  }

  const tokens = await issueTokenPair({ ...input, userId: identity.userId });
  return { tokens, userId: identity.userId, created };
}
