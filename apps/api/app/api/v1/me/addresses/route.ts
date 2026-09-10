import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

const AddressBody = z.object({
  label: z.string().max(40).optional(),
  recipientName: z.string().min(2).max(120),
  phone: z.string().min(6).max(24),
  line1: z.string().min(2).max(160),
  line2: z.string().max(160).optional(),
  city: z.string().min(1).max(80),
  region: z.string().max(80).optional(),
  country: z.string().min(2).max(2),
  postalCode: z.string().max(16).optional(),
  kind: z.enum(["HOME", "WORK", "OTHER"]).optional(),
  isDefault: z.boolean().optional(),
});

export const GET = withApi({ auth: true }, async ({ ctx }) => ({
  items: await commerce.listAddresses(ctx.principal!.userId),
}));

export const POST = withApi(
  { auth: true, body: AddressBody, audit: "commerce.address.create" },
  async ({ ctx, body }) => commerce.createAddress(ctx.principal!.userId, body),
);
