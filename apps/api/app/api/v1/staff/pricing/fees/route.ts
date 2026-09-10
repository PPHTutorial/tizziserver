import { z } from "zod";
import { admin } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  id: z.string().optional(),
  party: z.enum(["VENDOR", "COURIER"]),
  kind: z.enum(["COMMISSION", "PAYOUT", "LISTING", "WITHDRAWAL"]),
  params: z.record(z.string(), z.unknown()),
  platformSlug: z.string().optional(),
  activeFrom: z.coerce.date().optional(),
  activeTo: z.coerce.date().optional(),
});
export const POST = withApi({ auth: ["ADMIN"], body: Body, audit: "fee_schedule.upsert" }, async ({ body }) => admin.upsertFeeSchedule(body));
