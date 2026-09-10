import { wallet } from "@stall/core";
import { withApi } from "@/src/http/route";

export const GET = withApi({ auth: true, capability: "wallet" }, async ({ ctx }) =>
  wallet.getWallet(ctx.principal!.userId),
);
