import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

// POST /api/influencers/pics — Assign PIC(s) to influencer(s)
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requirePermission("influencers", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { influencerIds, userIds } = await request.json();

    if (!Array.isArray(influencerIds) || !Array.isArray(userIds) || influencerIds.length === 0 || userIds.length === 0) {
      return NextResponse.json({ error: "influencerIds and userIds are required" }, { status: 400 });
    }

    // If not admin, verify user is a PIC on these influencers (or assigning themselves)
    if (user.role !== "Admin") {
      const isSelfOnly = userIds.length === 1 && userIds[0] === user.id;
      if (!isSelfOnly) {
        // Check if user is already a PIC on all these influencers
        const existingCount = await prisma.influencerPic.count({
          where: {
            influencerId: { in: influencerIds },
            userId: user.id,
          },
        });
        if (existingCount < influencerIds.length) {
          return NextResponse.json({ error: "You can only assign PICs to influencers you are assigned to" }, { status: 403 });
        }
      }
    }

    // Create assignments, skip duplicates
    const data = influencerIds.flatMap((infId: string) =>
      userIds.map((uid: string) => ({
        influencerId: infId,
        userId: uid,
      })),
    );

    await prisma.influencerPic.createMany({
      data,
      skipDuplicates: true,
    });

    // Get user names for activity log
    const assignedUsers = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { name: true, email: true },
    });
    const names = assignedUsers.map((u) => u.name ?? u.email).join(", ");

    // Create activity logs
    await prisma.activityLog.createMany({
      data: influencerIds.map((infId: string) => ({
        influencerId: infId,
        type: "pic_assigned",
        title: "PIC assigned",
        detail: names,
      })),
    });

    return NextResponse.json({
      message: `Assigned ${userIds.length} PIC(s) to ${influencerIds.length} influencer(s)`,
    });
  } catch (error) {
    console.error("Failed to assign PIC:", error);
    return NextResponse.json({ error: "Failed to assign PIC" }, { status: 500 });
  }
}

// DELETE /api/influencers/pics — Remove PIC from influencer(s)
export async function DELETE(request: NextRequest) {
  let user;
  try {
    user = await requirePermission("influencers", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { influencerIds, userId } = await request.json();

    if (!Array.isArray(influencerIds) || !userId) {
      return NextResponse.json({ error: "influencerIds and userId are required" }, { status: 400 });
    }

    // Non-admin can only remove themselves or PICs from their assigned influencers
    if (user.role !== "Admin" && userId !== user.id) {
      const existingCount = await prisma.influencerPic.count({
        where: { influencerId: { in: influencerIds }, userId: user.id },
      });
      if (existingCount < influencerIds.length) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { count } = await prisma.influencerPic.deleteMany({
      where: {
        influencerId: { in: influencerIds },
        userId,
      },
    });

    // Activity log
    const removedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    if (count > 0) {
      await prisma.activityLog.createMany({
        data: influencerIds.map((infId: string) => ({
          influencerId: infId,
          type: "pic_assigned",
          title: "PIC removed",
          detail: removedUser?.name ?? removedUser?.email ?? userId,
        })),
      });
    }

    return NextResponse.json({ message: `Removed PIC from ${count} influencer(s)` });
  } catch (error) {
    console.error("Failed to remove PIC:", error);
    return NextResponse.json({ error: "Failed to remove PIC" }, { status: 500 });
  }
}
