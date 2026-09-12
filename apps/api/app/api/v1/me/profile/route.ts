import { z } from "zod";
import { auth } from "@stall/core";
import { withApi } from "@/src/http/route";

const ProfileBody = z.object({
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  avatar: z.string().max(500).optional(),
});

export const PATCH = withApi(
  { auth: true, body: ProfileBody, audit: "auth.profile.update" },
  async ({ ctx, body }) => auth.updateProfile(ctx.principal!.userId, body),
);
