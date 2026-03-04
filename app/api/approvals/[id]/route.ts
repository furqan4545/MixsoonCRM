import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { createNotification } from "@/app/lib/notifications";

// GET /api/approvals/:id — Single approval detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("approvals", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    const approval = await prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        influencer: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            rate: true,
            pipelineStage: true,
            followers: true,
            platform: true,
            country: true,
            engagementRate: true,
            profileUrl: true,
          },
        },
        submittedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    if (!approval) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(approval);
  } catch (error) {
    console.error("[GET /api/approvals/:id]", error);
    return NextResponse.json(
      { error: "Failed to fetch approval" },
      { status: 500 },
    );
  }
}

// PATCH /api/approvals/:id — CEO reviews (approve / reject / counter)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requirePermission("approvals", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  // Only Admin can review approvals
  if (user.role !== "Admin") {
    return NextResponse.json(
      { error: "Only admins can review approvals" },
      { status: 403 },
    );
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, counterRate, counterNotes, ceoFeedback, feedbackStatus, contractStatus } =
    body as {
      action?: string;
      counterRate?: number;
      counterNotes?: string;
      ceoFeedback?: string;
      feedbackStatus?: string;
      contractStatus?: string;
    };

  const VALID_ACTIONS = ["approve", "reject", "counter", "update"];
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: "action must be: approve, reject, counter, or update" },
      { status: 400 },
    );
  }

  const richInclude = {
    influencer: {
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        rate: true,
        pipelineStage: true,
        followers: true,
        platform: true,
        country: true,
        engagementRate: true,
        profileUrl: true,
      },
    },
    submittedBy: { select: { id: true, name: true, email: true } },
    reviewedBy: { select: { id: true, name: true, email: true } },
    campaign: { select: { id: true, name: true } },
  };

  try {
    const existing = await prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        influencer: { select: { id: true, username: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // "update" action — save CEO feedback / status without changing approval status
    if (action === "update") {
      const updateFields: Record<string, unknown> = {};
      if (ceoFeedback !== undefined) updateFields.ceoFeedback = ceoFeedback.trim() || null;
      if (feedbackStatus) updateFields.feedbackStatus = feedbackStatus;
      if (contractStatus) updateFields.contractStatus = contractStatus;

      if (Object.keys(updateFields).length === 0) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
      }

      const updated = await prisma.approvalRequest.update({
        where: { id },
        data: updateFields,
        include: richInclude,
      });

      return NextResponse.json(updated);
    }

    // For approve/reject/counter, must still be PENDING
    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { error: "This approval has already been reviewed" },
        { status: 400 },
      );
    }

    const statusMap: Record<string, "APPROVED" | "REJECTED" | "COUNTER_OFFERED"> = {
      approve: "APPROVED",
      reject: "REJECTED",
      counter: "COUNTER_OFFERED",
    };

    const updateData: Record<string, unknown> = {
      status: statusMap[action],
      reviewedById: user.id,
      reviewedAt: new Date(),
    };

    if (action === "counter") {
      if (!counterRate) {
        return NextResponse.json(
          { error: "counterRate is required for counter-offer" },
          { status: 400 },
        );
      }
      updateData.counterRate = Number(counterRate);
      updateData.counterNotes = counterNotes?.trim() || null;
    }

    // Auto-set contract status on approve
    if (action === "approve") {
      updateData.contractStatus = "APPROVED";
    }

    const updated = await prisma.approvalRequest.update({
      where: { id },
      data: updateData,
      include: richInclude,
    });

    const influencerId = existing.influencerId;
    const actionLabels: Record<string, string> = {
      approve: "Approved",
      reject: "Rejected",
      counter: "Counter-offered",
    };

    // Activity log on influencer
    await prisma.activityLog.create({
      data: {
        influencerId,
        type: "approval_reviewed",
        title: `Approval ${actionLabels[action].toLowerCase()}`,
        detail:
          action === "counter"
            ? `Counter rate: ${existing.currency} ${counterRate} | ${counterNotes || "No notes"}`
            : `Rate: ${existing.currency} ${existing.rate}`,
      },
    });

    // If approved, update influencer pipeline + rate
    if (action === "approve") {
      await prisma.influencer.update({
        where: { id: influencerId },
        data: {
          pipelineStage: "CONTRACTED",
          rate: existing.rate,
        },
      });

      await prisma.activityLog.create({
        data: {
          influencerId,
          type: "pipeline_change",
          title: "Pipeline stage changed",
          detail: "Stage: Contracted (via approval)",
        },
      });
    }

    // Notify PIC of the decision
    const decisionMsg: Record<string, string> = {
      approve: `approved @${existing.influencer.username} at ${existing.currency} ${existing.rate}`,
      reject: `rejected @${existing.influencer.username}`,
      counter: `counter-offered @${existing.influencer.username} at ${existing.currency} ${counterRate}`,
    };

    await createNotification({
      type: "approval",
      status:
        action === "approve"
          ? "success"
          : action === "reject"
            ? "error"
            : "info",
      title: `Approval ${actionLabels[action].toLowerCase()}`,
      message: `${user.name || user.email} ${decisionMsg[action]}`,
      approvalId: id,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/approvals/:id]", error);
    return NextResponse.json(
      { error: "Failed to review approval" },
      { status: 500 },
    );
  }
}
