import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ["@stall/db", "@stall/config"],
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
