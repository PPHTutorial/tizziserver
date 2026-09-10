/**
 * Admin/ops console session — a short-lived, staff-only cookie, distinct from
 * the mobile bearer-token flow. Signed with the same EdDSA keypair but its own
 * audience (`stall-admin`) and TTL (`ADMIN_SESSION_TTL_HOURS`).
 */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from "jose";
import { env } from "@stall/config";
import { prisma } from "@stall/db";

const ALG = "EdDSA";
const COOKIE = "stall_admin";
const AUD = "stall-admin";

const pem = (b64: string, label: "PRIVATE KEY" | "PUBLIC KEY") =>
  `-----BEGIN ${label}-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END ${label}-----\n`;
const privateKeyP = importPKCS8(pem(env.JWT_PRIVATE_KEY, "PRIVATE KEY"), ALG);
const publicKeyP = importSPKI(pem(env.JWT_PUBLIC_KEY, "PUBLIC KEY"), ALG);

export interface AdminSession {
  userId: string;
  name: string;
  roles: string[];
  isSuper: boolean;
}

export async function createAdminSession(userId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { where: { status: "ACTIVE" }, select: { role: true } } },
  });
  if (!user) return { ok: false, reason: "User not found" };
  const roles = user.roles.map((r) => r.role);
  if (!roles.includes("STAFF") && !roles.includes("ADMIN")) {
    return { ok: false, reason: "This account doesn't have console access" };
  }
  const token = await new SignJWT({ roles, name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.phone })
    .setProtectedHeader({ alg: ALG, typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer(env.JWT_ISSUER)
    .setAudience(AUD)
    .setExpirationTime(`${env.ADMIN_SESSION_TTL_HOURS}h`)
    .sign(await privateKeyP);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: env.ADMIN_SESSION_TTL_HOURS * 3600,
  });
  return { ok: true };
}

export async function readAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, await publicKeyP, { issuer: env.JWT_ISSUER, audience: AUD });
    const userId = String(payload.sub);
    // Re-derive authority from the DB on every request instead of trusting the
    // JWT's embedded roles — this session has no epoch/revocation mechanism of
    // its own, so a fired/demoted/suspended staff member must lose access on
    // their very next request, not merely at the cookie's natural expiry.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { where: { status: "ACTIVE" }, select: { role: true } } },
    });
    if (!user || user.status !== "ACTIVE") return null;
    const roles = user.roles.map((r) => r.role);
    if (!roles.includes("STAFF") && !roles.includes("ADMIN")) return null;
    return { userId, name: String(payload.name ?? "Staff"), roles, isSuper: roles.includes("ADMIN") };
  } catch {
    return null;
  }
}

export async function requireAdmin(): Promise<AdminSession> {
  const s = await readAdminSession();
  if (!s) redirect("/admin/login");
  return s;
}

/** Like `requireAdmin`, but for platform-sensitive actions (pricing, feature
 * flags, boost tiers, draws, broadcasts, dispute refunds, safety actions) that
 * must stay ADMIN-only — a STAFF session is turned away, not just any session. */
export async function requireSuperAdmin(): Promise<AdminSession> {
  const s = await requireAdmin();
  if (!s.isSuper) redirect("/admin?error=forbidden");
  return s;
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
