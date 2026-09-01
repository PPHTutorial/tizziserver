import { z } from "zod";
import { auth as coreAuth, AppError } from "@stall/core";
import { sendEmail } from "@/lib/email";
import { withApi } from "@/src/http/route";

const Body = z
  .object({
    phone: z.string().min(8).optional(),
    email: z.string().email().optional(),
    purpose: z.enum(["LOGIN", "VERIFY_PHONE", "VERIFY_EMAIL", "RESET_PASSWORD", "RESET_PIN"]).default("LOGIN"),
  })
  .refine((b) => b.phone || b.email, { message: "phone or email is required" });

export const POST = withApi(
  { body: Body, rateLimit: { limit: 5, windowSec: 60, by: "ip" } },
  async ({ body }) => {
    const channel = body.phone ? "SMS" : "EMAIL";
    const target = (body.phone ?? body.email)!;
    const { code, expiresAt } = await coreAuth.issueOtp({ target, channel, purpose: body.purpose });

    if (channel === "SMS") {
      await coreAuth.sendSms(target, `Your Stall code is ${code}. Expires in 10 minutes.`);
    } else {
      const res = await sendEmail(target, {
        subject: "Your Stall verification code",
        text: `Your code is ${code}. It expires in 10 minutes.`,
        html: `<p>Your Stall verification code is <b style="font-size:20px">${code}</b>.</p><p>It expires in 10 minutes.</p>`,
      });
      if (!res.success) throw new AppError("INTERNAL", "Failed to send verification email");
    }
    return { sent: true, channel, expiresAt: expiresAt.toISOString() };
  },
);
