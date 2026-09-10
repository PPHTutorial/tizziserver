import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

const PatchBody = z.object({
  label: z.string().max(40).optional(),
  recipientName: z.string().min(2).max(120).optional(),
  phone: z.string().min(6).max(24).optional(),
  line1: z.string().min(2).max(160).optional(),
  line2: z.string().max(160).optional(),
  city: z.string().min(1).max(80).optional(),
  region: z.string().max(80).optional(),
  country: z.string().min(2).max(2).optional(),
  postalCode: z.string().max(16).optional(),
  kind: z.enum(["HOME", "WORK", "OTHER"]).optional(),
  isDefault: z.boolean().optional(),
});

export const PATCH = withApi(
  { auth: true, body: PatchBody, audit: "commerce.address.update" },
  async ({ ctx, params, body }) => commerce.updateAddress(ctx.principal!.userId, params.id!, body),
);

export const DELETE = withApi(
  { auth: true, audit: "commerce.address.delete" },
  async ({ ctx, params }) => commerce.deleteAddress(ctx.principal!.userId, params.id!),
);
