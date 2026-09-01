import { NextResponse, type NextRequest } from "next/server";
import { auth as coreAuth, isAppError } from "@stall/core";
import { env } from "@stall/config";
import { prisma } from "@stall/db";
import { publicUser } from "@/src/http/dto";

/**
 * Legacy `{action}` RPC endpoint. The dispatcher + the 6 Tizzi-Gas services are
 * retired (`apps/api/_legacy_services/`). This shim only bridges the auth actions
 * the existing gas app still calls onto `/api/v1/*`; everything else is 410.
 */
export async function POST(request: NextRequest) {
  let action = "unknown";
  let data: Record<string, unknown> = {};
  try {
    const body = await request.json();
    if (body && typeof body.action === "string") action = body.action;
    if (body && typeof body.data === "object" && body.data) data = body.data as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  const platform = request.headers.get("x-platform") ?? env.DEFAULT_PLATFORM;
  const ua = request.headers.get("user-agent") ?? undefined;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  try {
    switch (action) {
      case "test":
        return NextResponse.json({ success: true, message: "Success", data: "Test successful" });

      case "auth.send-otp": {
        const phone = String(data.phoneNumber ?? data.phone ?? "");
        const { code, expiresAt } = await coreAuth.issueOtp({ target: phone, channel: "SMS", purpose: "LOGIN" });
        await coreAuth.sendSms(phone, `Your Stall code is ${code}. Expires in 10 minutes.`);
        return NextResponse.json({ success: true, message: "OTP sent", data: { expiresAt } });
      }

      case "auth.verify-otp": {
        const phone = String(data.phoneNumber ?? data.phone ?? "");
        const code = String(data.otp ?? data.code ?? "");
        await coreAuth.verifyOtp({ target: phone, channel: "SMS", purpose: "LOGIN", code });
        const user = await coreAuth.findOrCreateUserByPhone(phone);
        await coreAuth.markPhoneVerified(user.id);
        const pair = await coreAuth.issueTokenPair({ userId: user.id, platform, userAgent: ua, ip });
        const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
        return NextResponse.json({
          success: true,
          data: { token: pair.accessToken, accessToken: pair.accessToken, refreshToken: pair.refreshToken, user: publicUser(fresh) },
        });
      }

      case "auth.refresh-token": {
        const pair = await coreAuth.rotateTokenPair({ refreshToken: String(data.refreshToken ?? ""), platform, userAgent: ua, ip });
        return NextResponse.json({ success: true, data: { token: pair.accessToken, accessToken: pair.accessToken, refreshToken: pair.refreshToken } });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            ok: false,
            error: { code: "ENDPOINT_MIGRATED", message: `Action "${action}" is retired. Use /api/v1/*.`, action },
          },
          { status: 410 },
        );
    }
  } catch (e) {
    if (isAppError(e)) {
      return NextResponse.json({ success: false, ok: false, error: { code: e.code, message: e.message } }, { status: e.status });
    }
    console.error("[_compat]", e);
    return NextResponse.json({ success: false, error: { code: "INTERNAL", message: "Internal server error" } }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json(
    { success: false, error: { code: "USE_POST", message: "Legacy RPC accepts POST only; prefer /api/v1/*." } },
    { status: 405 },
  );
}
