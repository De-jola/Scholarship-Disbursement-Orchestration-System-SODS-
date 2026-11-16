import { PrismaClient } from "@prisma/client";
import { runSeed } from "./seed-lib";

const prisma = new PrismaClient();

runSeed(prisma)
  .then(async () => {
    console.log("SDOS demo database seeded with synthetic data.");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
