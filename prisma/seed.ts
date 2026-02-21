import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../app/generated/prisma/client";

const prisma = new PrismaClient();

const DEFAULT_ADMIN_PASSWORD = "admin123";

async function main() {
  const admin = await prisma.role.upsert({
    where: { name: "Admin" },
    update: {},
    create: { name: "Admin" },
  });

  const pic = await prisma.role.upsert({
    where: { name: "PIC" },
    update: {},
    create: { name: "PIC" },
  });

  const viewer = await prisma.role.upsert({
    where: { name: "Viewer" },
    update: {},
    create: { name: "Viewer" },
  });

  const adminPermissions = [
    { feature: "data-scraper", action: "read" },
    { feature: "data-scraper", action: "write" },
    { feature: "data-scraper", action: "delete" },
    { feature: "csv-upload", action: "read" },
    { feature: "csv-upload", action: "write" },
    { feature: "csv-upload", action: "delete" },
    { feature: "imports", action: "read" },
    { feature: "imports", action: "write" },
    { feature: "imports", action: "delete" },
    { feature: "ai-filter", action: "read" },
    { feature: "ai-filter", action: "write" },
    { feature: "ai-filter", action: "delete" },
    { feature: "queues", action: "read" },
    { feature: "queues", action: "write" },
    { feature: "queues", action: "delete" },
    { feature: "influencers", action: "read" },
    { feature: "influencers", action: "write" },
    { feature: "influencers", action: "delete" },
    { feature: "notifications", action: "read" },
    { feature: "users", action: "read" },
    { feature: "users", action: "write" },
    { feature: "users", action: "delete" },
  ];

  const picPermissions = [
    { feature: "data-scraper", action: "read" },
    { feature: "data-scraper", action: "write" },
    { feature: "csv-upload", action: "read" },
    { feature: "csv-upload", action: "write" },
    { feature: "imports", action: "read" },
    { feature: "imports", action: "write" },
    { feature: "ai-filter", action: "read" },
    { feature: "ai-filter", action: "write" },
    { feature: "queues", action: "read" },
    { feature: "queues", action: "write" },
    { feature: "influencers", action: "read" },
    { feature: "influencers", action: "write" },
    { feature: "notifications", action: "read" },
  ];

  const viewerPermissions = [
    { feature: "data-scraper", action: "read" },
    { feature: "csv-upload", action: "read" },
    { feature: "imports", action: "read" },
    { feature: "ai-filter", action: "read" },
    { feature: "queues", action: "read" },
    { feature: "influencers", action: "read" },
    { feature: "notifications", action: "read" },
  ];

  for (const perm of adminPermissions) {
    await prisma.permission.upsert({
      where: {
        roleId_feature_action: {
          roleId: admin.id,
          feature: perm.feature,
          action: perm.action,
        },
      },
      update: {},
      create: { roleId: admin.id, ...perm },
    });
  }

  for (const perm of picPermissions) {
    await prisma.permission.upsert({
      where: {
        roleId_feature_action: {
          roleId: pic.id,
          feature: perm.feature,
          action: perm.action,
        },
      },
      update: {},
      create: { roleId: pic.id, ...perm },
    });
  }

  for (const perm of viewerPermissions) {
    await prisma.permission.upsert({
      where: {
        roleId_feature_action: {
          roleId: viewer.id,
          feature: perm.feature,
          action: perm.action,
        },
      },
      update: {},
      create: { roleId: viewer.id, ...perm },
    });
  }

  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
  const adminEmail = "admin@mixsoon.com";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, status: "ACTIVE" },
    create: {
      email: adminEmail,
      name: "Admin",
      passwordHash,
      status: "ACTIVE",
      roleId: admin.id,
    },
  });

  // Force-update password so login always works (handles stale placeholder hash from migration)
  await prisma.user.updateMany({
    where: { email: adminEmail },
    data: { passwordHash, status: "ACTIVE" },
  });

  console.log(
    "Seed completed: 3 roles, permissions, and default admin user (admin@mixsoon.com / " +
      DEFAULT_ADMIN_PASSWORD +
      ")",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
