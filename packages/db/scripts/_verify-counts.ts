import path from "node:path";
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: path.resolve(import.meta.dirname, "../../../.env") });
const { prisma } = await import("../src/index.ts");

console.log("total users:", await prisma.user.count());
console.log("bulk users (phone +23390%):", await prisma.user.count({ where: { phone: { startsWith: "+23390" } } }));
console.log("total vendors:", await prisma.vendorProfile.count());
console.log("total products:", await prisma.product.count());
console.log("total orders:", await prisma.order.count());
console.log("total reviews:", await prisma.productReview.count());

await prisma.$disconnect();
