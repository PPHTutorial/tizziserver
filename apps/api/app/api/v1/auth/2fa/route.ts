import { z } from "zod";
import { prisma } from "@stall/db";
import { auth as coreAuth, AppError } from "@stall/core";
import { withApi } from "@/src/http/route";

/**
 * TOTP 2FA lifecycle on one endpoint (`action`):
 *   enroll  → { uri, secret }              (QR for the authenticator app)
 *   confirm → { recoveryCodes }            (activates 2FA)
 *   disable → { disabled: true }           (needs a valid code)
 *   status  → { enrolled, pending }
 */
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enroll") }),
  z.object({ action: z.literal("confirm"), code: z.string().min(6).max(10) }),
  z.object({ action: z.literal("disable"), code: z.string().min(6).max(10) }),
  z.object({ action: z.literal("status") }),
]);

export const POST = withApi(
  { auth: true, body: Body, rateLimit: { limit: 15, windowSec: 60, by: "principal" }, audit: (r) => ({ action: `auth.2fa.${(r.data as { action?: string }).action ?? "op"}` }) },
  async ({ body, ctx }) => {
    const userId = ctx.principal!.userId;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, phone: true } });
    const label = user.email ?? user.phone;

    switch (body.action) {
      case "enroll":
        return { action: "enroll", ...(await coreAuth.enrollTotp(userId, label)) };
      case "confirm":
        return { action: "confirm", ...(await coreAuth.confirmTotp(userId, body.code)) };
      case "disable": {
        if (!(await coreAuth.verifyTotp(userId, body.code))) throw new AppError("INVALID_OTP", "Incorrect 2FA code");
        await coreAuth.disableTotp(userId);
        return { action: "disable", disabled: true };
      }
      case "status": {
        const cred = await prisma.credential.findUnique({ where: { userId_kind: { userId, kind: "TOTP" } } });
        return {
          action: "status",
          enrolled: Boolean(cred),
          pending: (cred?.params as { pending?: boolean } | null)?.pending === true,
        };
      }
    }
  },
);
