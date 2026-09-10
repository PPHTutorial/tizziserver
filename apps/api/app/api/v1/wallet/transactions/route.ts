import { z } from "zod";
import { wallet } from "@stall/core";
import { withApi } from "@/src/http/route";

export const GET = withApi(
  { auth: true, capability: "wallet", query: z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().positive().max(60).optional() }) },
  async ({ ctx, query }) => wallet.listWalletTransactions(ctx.principal!.userId, query),
);
