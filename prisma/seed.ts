import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Seed roles
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

  // Admin permissions — full access to everything
  const adminPermissions = [
    { feature: "data-scraper", action: "read" },
    { feature: "data-scraper", action: "write" },
    { feature: "data-scraper", action: "delete" },
    { feature: "csv-upload", action: "read" },
    { feature: "csv-upload", action: "write" },
    { feature: "users", action: "read" },
    { feature: "users", action: "write" },
    { feature: "users", action: "delete" },
  ];

  // PIC permissions — can scrape and upload, but not manage users
  const picPermissions = [
    { feature: "data-scraper", action: "read" },
    { feature: "data-scraper", action: "write" },
    { feature: "csv-upload", action: "read" },
    { feature: "csv-upload", action: "write" },
  ];

  // Viewer permissions — read only
  const viewerPermissions = [
    { feature: "data-scraper", action: "read" },
    { feature: "csv-upload", action: "read" },
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

  // Seed a default admin user
  await prisma.user.upsert({
    where: { email: "admin@mixsoon.com" },
    update: {},
    create: {
      email: "admin@mixsoon.com",
      name: "Admin",
      roleId: admin.id,
    },
  });

  console.log("Seed completed: 3 roles, permissions, and default admin user.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
