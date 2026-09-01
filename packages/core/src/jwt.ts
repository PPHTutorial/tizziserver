import { SignJWT, jwtVerify, importPKCS8, importSPKI, type JWTPayload } from "jose";
import { env } from "@stall/config";
import { AppError } from "./errors.ts";
import type { Role } from "@stall/db";

const ALG = "EdDSA";

const pem = (b64: string, label: "PRIVATE KEY" | "PUBLIC KEY") =>
  `-----BEGIN ${label}-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END ${label}-----\n`;

const privateKeyP = importPKCS8(pem(env.JWT_PRIVATE_KEY, "PRIVATE KEY"), ALG);
const publicKeyP = importSPKI(pem(env.JWT_PUBLIC_KEY, "PUBLIC KEY"), ALG);

export interface AccessClaims {
  /** userId */
  sub: string;
  /** session id (the refresh-token family anchor) */
  sid: string;
  /** the role this token acts as */
  activeRole: Role;
  /** every ACTIVE role the user holds */
  roles: Role[];
  /** platform slug the client is on */
  platform: string;
  deviceId?: string;
  /** token-epoch version — must match the user's current TokenEpoch.ver */
  ver: number;
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ ...claims } as unknown as JWTPayload)
    .setProtectedHeader({ alg: ALG, typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(await privateKeyP);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, await publicKeyP, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    return payload as unknown as AccessClaims;
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e && e.code === "ERR_JWT_EXPIRED"
        ? "TOKEN_EXPIRED"
        : "INVALID_TOKEN";
    throw new AppError(code, "Access token rejected");
  }
}
