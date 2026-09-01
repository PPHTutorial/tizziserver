import { env } from "@stall/config";

/**
 * SMS port. In dev (`SMS_PROVIDER=log`) the code is printed to the server log.
 * Nalo / Twilio adapters land when real credentials are provided.
 */
export async function sendSms(to: string, text: string): Promise<void> {
  switch (env.SMS_PROVIDER) {
    case "log":
      console.log(`\n📱 [SMS → ${to}]\n   ${text}\n`);
      return;
    case "nalo": {
      if (!env.NALO_API_BASE_URL || !env.NALO_API_KEY || !env.NALO_SENDER_ID) {
        console.warn("[SMS] nalo selected but not configured — falling back to log");
        console.log(`📱 [SMS → ${to}] ${text}`);
        return;
      }
      const url = new URL(env.NALO_API_BASE_URL);
      url.searchParams.set("key", env.NALO_API_KEY);
      url.searchParams.set("msisdn", to);
      url.searchParams.set("message", text);
      url.searchParams.set("sender_id", env.NALO_SENDER_ID);
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error(`Nalo SMS failed: ${res.status}`);
      return;
    }
    case "twilio":
      throw new Error("Twilio SMS adapter not implemented yet");
  }
}
