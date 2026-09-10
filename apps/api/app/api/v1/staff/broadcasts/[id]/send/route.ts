import { admin } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: ["ADMIN"], audit: "broadcast.send" }, async ({ params }) => admin.sendBroadcast(params.id!));
