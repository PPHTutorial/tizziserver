import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ["@grandprice/db", "@grandprice/config"],
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
