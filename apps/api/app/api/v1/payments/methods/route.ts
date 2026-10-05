import { payments } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Which ways to pay the app may offer for a wallet top-up (gateway + currency dependent). */
export const GET = withApi({ auth: true, capability: "wallet" }, async () => payments.availablePaymentMethods());
