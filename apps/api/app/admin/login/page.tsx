"use client";

import { useActionState } from "react";
import { requestLoginOtp, verifyLoginOtp, verifyLoginTotp } from "../actions";
import { input, btn } from "../_ui";

type State = { step: "phone" | "otp" | "totp"; phone?: string; error: string | null };
const initial: State = { step: "phone", error: null };

export default function AdminLogin() {
  const [reqState, reqAction] = useActionState(requestLoginOtp as never, initial as never);
  const [verState, verAction] = useActionState(verifyLoginOtp as never, initial as never);
  const [totpState, totpAction] = useActionState(verifyLoginTotp as never, initial as never);

  // Each form keeps its own action state; whichever step's action last ran
  // wins — totp (furthest along) beats otp beats the initial phone step.
  const t = totpState as State;
  const v = verState as State;
  const s = t.phone ? t : v.phone ? v : (reqState as State);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-xl p-6">
        <div className="text-base font-bold tracking-tight">STALL · Ops Console</div>
        <p className="text-sm text-neutral-500 mt-1 mb-5">Staff &amp; admin sign-in. A one-time code is sent by SMS.</p>

        {s.step === "phone" && (
          <form action={reqAction} className="space-y-3">
            <label className="block text-xs text-neutral-500">Phone number</label>
            <input name="phone" placeholder="+23320…" className={input} autoComplete="tel" required />
            <button className={btn + " w-full"} type="submit">Send code</button>
          </form>
        )}

        {s.step === "otp" && (
          <form action={verAction} className="space-y-3">
            <input type="hidden" name="phone" value={s.phone} />
            <label className="block text-xs text-neutral-500">Enter the 6-digit code sent to {s.phone}</label>
            <input name="code" inputMode="numeric" placeholder="••••••" className={input} required />
            <button className={btn + " w-full"} type="submit">Verify &amp; sign in</button>
          </form>
        )}

        {s.step === "totp" && (
          <form action={totpAction} className="space-y-3">
            <input type="hidden" name="phone" value={s.phone} />
            <label className="block text-xs text-neutral-500">Enter your 6-digit authenticator app code</label>
            <input name="code" inputMode="numeric" placeholder="••••••" className={input} required autoFocus />
            <button className={btn + " w-full"} type="submit">Verify 2FA</button>
          </form>
        )}

        {s.error ? <p className="text-sm text-red-600 mt-3">{s.error}</p> : null}
      </div>
    </div>
  );
}
