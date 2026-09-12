import { z } from "zod";
import { auth as coreAuth, AppError } from "@stall/core";
import { sendEmail } from "@/lib/email";
import { withApi } from "@/src/http/route";

const Body = z.object({ email: z.string().email() });

/** Issue a verification code to add/change the caller's email. */
export const POST = withApi(
  { auth: true, body: Body, rateLimit: { limit: 5, windowSec: 60, by: "principal" } },
  async ({ ctx, body }) => {
    const { code, expiresAt } = await coreAuth.requestEmailChange(ctx.principal!.userId, body.email);
    const res = await sendEmail(body.email, {
      subject: "Your Stall verification code",
      text: `Your code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your Stall verification code is <b style="font-size:20px">${code}</b>.</p><p>It expires in 10 minutes.</p>`,
    });
    if (!res.success) throw new AppError("INTERNAL", "Failed to send verification email");
    return { sent: true, expiresAt: expiresAt.toISOString() };
  },
);
