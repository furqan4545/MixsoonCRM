import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { assertCanAccess } from "@/app/lib/ownership";

const VALID_RESOURCE_TYPES = new Set([
  "Import",
  "Campaign",
  "Influencer",
  "Contract",
  "ContentSubmission",
  "AiFilterRun",
  "TrackedVideo",
  "Product",
]);
const VALID_PERMISSIONS = new Set(["read", "write", "admin"]);

// GET /api/resource-shares?resourceType=Import&resourceId=xxx
// List the users a resource is shared with.
export async function GET(request: NextRequest) {
  let currentUser;
  try {
    currentUser = await requirePermission("influencers", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const { searchParams } = request.nextUrl;
  const resourceType = searchParams.get("resourceType");
  const resourceId = searchParams.get("resourceId");
  if (!resourceType || !resourceId || !VALID_RESOURCE_TYPES.has(resourceType)) {
    return NextResponse.json(
      { error: "resourceType and resourceId are required" },
      { status: 400 },
    );
  }

  // Resolve the owner once so we can authorize the read.
  const ownerId = await getResourceOwnerId(resourceType, resourceId);
  if (ownerId === undefined) {
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }
  try {
    await assertCanAccess({
      resourceType,
      resourceId,
      user: currentUser,
      ownerId,
      required: "read",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const shares = await prisma.resourceShare.findMany({
    where: { resourceType, resourceId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    shares,
    ownerId,
  });
}

// POST /api/resource-shares — grant access to a user
export async function POST(request: NextRequest) {
  let currentUser;
  try {
    currentUser = await requirePermission("influencers", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { resourceType, resourceId, userId, permission = "read" } = body as {
    resourceType?: string;
    resourceId?: string;
    userId?: string;
    permission?: string;
  };
  if (
    !resourceType ||
    !resourceId ||
    !userId ||
    !VALID_RESOURCE_TYPES.has(resourceType) ||
    !VALID_PERMISSIONS.has(permission)
  ) {
    return NextResponse.json(
      { error: "Invalid resourceType, resourceId, userId, or permission" },
      { status: 400 },
    );
  }

  const ownerId = await getResourceOwnerId(resourceType, resourceId);
  if (ownerId === undefined) {
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }
  try {
    await assertCanAccess({
      resourceType,
      resourceId,
      user: currentUser,
      ownerId,
      required: "admin",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  // Don't share with the owner — they already have full access
  if (userId === ownerId) {
    return NextResponse.json(
      { error: "Cannot share with the resource's owner" },
      { status: 400 },
    );
  }

  const share = await prisma.resourceShare.upsert({
    where: {
      resourceType_resourceId_userId: { resourceType, resourceId, userId },
    },
    create: {
      resourceType,
      resourceId,
      userId,
      permission,
      sharedById: currentUser.id,
    },
    update: { permission, sharedById: currentUser.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json({ share }, { status: 201 });
}

// DELETE /api/resource-shares?resourceType=Import&resourceId=xxx&userId=yyy
export async function DELETE(request: NextRequest) {
  let currentUser;
  try {
    currentUser = await requirePermission("influencers", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const { searchParams } = request.nextUrl;
  const resourceType = searchParams.get("resourceType");
  const resourceId = searchParams.get("resourceId");
  const userId = searchParams.get("userId");
  if (
    !resourceType ||
    !resourceId ||
    !userId ||
    !VALID_RESOURCE_TYPES.has(resourceType)
  ) {
    return NextResponse.json(
      { error: "resourceType, resourceId and userId are required" },
      { status: 400 },
    );
  }

  const ownerId = await getResourceOwnerId(resourceType, resourceId);
  if (ownerId === undefined) {
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }
  try {
    await assertCanAccess({
      resourceType,
      resourceId,
      user: currentUser,
      ownerId,
      required: "admin",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  await prisma.resourceShare.deleteMany({
    where: { resourceType, resourceId, userId },
  });
  return NextResponse.json({ success: true });
}

async function getResourceOwnerId(
  resourceType: string,
  resourceId: string,
): Promise<string | null | undefined> {
  switch (resourceType) {
    case "Import": {
      const r = await prisma.import.findUnique({
        where: { id: resourceId },
        select: { createdById: true },
      });
      return r ? r.createdById : undefined;
    }
    case "Campaign": {
      const r = await prisma.campaign.findUnique({
        where: { id: resourceId },
        select: { createdById: true },
      });
      return r ? r.createdById : undefined;
    }
    case "Influencer": {
      const r = await prisma.influencer.findUnique({
        where: { id: resourceId },
        select: { createdById: true },
      });
      return r ? r.createdById : undefined;
    }
    case "Contract": {
      const r = await prisma.contract.findUnique({
        where: { id: resourceId },
        select: { createdById: true },
      });
      return r ? r.createdById : undefined;
    }
    case "ContentSubmission": {
      const r = await prisma.contentSubmission.findUnique({
        where: { id: resourceId },
        select: { createdById: true },
      });
      return r ? r.createdById : undefined;
    }
    case "AiFilterRun": {
      const r = await prisma.aiFilterRun.findUnique({
        where: { id: resourceId },
        select: { createdById: true },
      });
      return r ? r.createdById : undefined;
    }
    case "TrackedVideo": {
      const r = await prisma.trackedVideo.findUnique({
        where: { id: resourceId },
        select: { createdById: true },
      });
      return r ? r.createdById : undefined;
    }
    case "Product": {
      const r = await prisma.product.findUnique({
        where: { id: resourceId },
        select: { createdById: true },
      });
      return r ? r.createdById : undefined;
    }
    default:
      return undefined;
  }
}
