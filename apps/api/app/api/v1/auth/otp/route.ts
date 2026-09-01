import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth as coreAuth, AppError } from "@stall/core";
import { sendEmail } from "@/lib/email";
import { handle, ok } from "@/src/http/envelope";
import { getContext } from "@/src/http/context";

const Body = z
  .object({
    phone: z.string().min(8).optional(),
    email: z.string().email().optional(),
    purpose: z.enum(["LOGIN", "VERIFY_PHONE", "VERIFY_EMAIL", "RESET_PASSWORD", "RESET_PIN"]).default("LOGIN"),
  })
  .refine((b) => b.phone || b.email, { message: "phone or email is required" });

export const POST = handle(async (req: NextRequest) => {
  await getContext(req); // parse headers (rate-limit hook later)
  const { phone, email, purpose } = Body.parse(await req.json());

  const channel = phone ? "SMS" : "EMAIL";
  const target = (phone ?? email)!;
  const { code, expiresAt } = await coreAuth.issueOtp({ target, channel, purpose });

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

  return ok({ sent: true, channel, expiresAt: expiresAt.toISOString() });
});
