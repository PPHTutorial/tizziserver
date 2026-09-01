import { prisma, type Role } from "@stall/db";
import { AppError } from "../errors.ts";
import { resolveFeatures, type Features } from "./features.ts";
import { NAV, type NavItem } from "./nav.ts";

export interface BootstrapPayload {
  platform: { slug: string; name: string; defaultCurrency: string; theme: unknown };
  authenticated: boolean;
  activeRole: Role | null;
  roles: Role[];
  features: Features;
  nav: NavItem[];
  minAppVersion: { ios: string; android: string };
}

export interface BootstrapInput {
  platformSlug: string;
  principal?: { userId: string; activeRole: Role; roles: Role[] };
  regionCode?: string;
}

/** Everything a client needs on launch: tenant identity, capability set, nav, min version. */
export async function buildBootstrap(input: BootstrapInput): Promise<BootstrapPayload> {
  const platform = await prisma.platform.findUnique({ where: { slug: input.platformSlug } });
  if (!platform || platform.status === "DISABLED") {
    throw new AppError("NOT_FOUND", `Unknown or disabled platform "${input.platformSlug}"`);
  }

  const activeRole = input.principal?.activeRole ?? null;
  const features = await resolveFeatures({
    platformSlug: platform.slug,
    role: activeRole ?? undefined,
    userId: input.principal?.userId,
    regionCode: input.regionCode,
  });

  const minCfg = await prisma.appConfig.findFirst({ where: { key: "app.min_version", scope: "GLOBAL" } });
  const minAppVersion = (minCfg?.value as { ios?: string; android?: string } | undefined) ?? {};

  return {
    platform: {
      slug: platform.slug,
      name: platform.name,
      defaultCurrency: platform.defaultCurrency,
      theme: platform.theme,
    },
    authenticated: Boolean(input.principal),
    activeRole,
    roles: input.principal?.roles ?? [],
    features,
    nav: activeRole ? (NAV[activeRole] ?? []) : [],
    minAppVersion: { ios: minAppVersion.ios ?? "1.0.0", android: minAppVersion.android ?? "1.0.0" },
  };
}
