/**
 * Database seed (stub — Phase 0).
 *
 * Phase 1 fills this in: Platform('grandprice'), Platform('tizzi-gas'),
 * the FeatureFlag registry + PlatformFeature rows (auction/advertising OFF for
 * tizzi-gas), the Gas category subtree, PricingRule + FeeSchedule defaults.
 */
import { prisma } from "../src/index.ts";

async function main() {
  console.log("seed: nothing to do yet (schema v1). See docs/05-ROADMAP.md Phase 1.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
