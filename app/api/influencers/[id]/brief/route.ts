import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { getSmtpTransport } from "@/app/lib/email";

type Params = { params: Promise<{ id: string }> };

// GET /api/influencers/[id]/brief?campaignId=X
//   Returns the body / howToPost / hashtags that should pre-fill the editor —
//   per-influencer override if it exists, otherwise the campaign's default.
export async function GET(request: NextRequest, { params }: Params) {
  await requirePermission("influencers", "read");
  const { id: influencerId } = await params;
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  const [campaign, override] = await Promise.all([
    prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        name: true,
        contentBriefBody: true,
        contentBriefHowToPost: true,
        contentBriefHashtags: true,
      },
    }),
    prisma.contentBriefOverride.findUnique({
      where: {
        marketingCampaignId_influencerId: {
          marketingCampaignId: campaignId,
          influencerId,
        },
      },
    }),
  ]);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({
    campaignId: campaign.id,
    campaignName: campaign.name,
    body: override?.body ?? campaign.contentBriefBody ?? "",
    howToPost: override?.howToPost ?? campaign.contentBriefHowToPost ?? "",
    hashtags: override?.hashtags ?? campaign.contentBriefHashtags ?? [],
    source: override ? "override" : "campaign-default",
  });
}

// POST /api/influencers/[id]/brief
//   Body: { campaignId, body, howToPost, hashtags, uploadDate?, notes?, saveAsOverride? }
//   - Snapshots everything into a ContentBrief row (audit log).
//   - Emails the influencer with the brief — no buttons, no public form.
//   - If saveAsOverride=true, upserts ContentBriefOverride so future sends
//     pre-fill from this version instead of the campaign default.
export async function POST(request: NextRequest, { params }: Params) {
  const user = await requirePermission("influencers", "write");
  const { id: influencerId } = await params;
  const body = await request.json();
  const {
    campaignId,
    body: briefBody,
    howToPost,
    hashtags,
    uploadDate,
    notes,
    saveAsOverride,
  } = body as {
    campaignId?: string;
    body?: string;
    howToPost?: string;
    hashtags?: string[];
    uploadDate?: string;
    notes?: string;
    saveAsOverride?: boolean;
  };

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }
  if (!briefBody || !briefBody.trim()) {
    return NextResponse.json({ error: "Guidelines body is required" }, { status: 400 });
  }

  const [influencer, campaign] = await Promise.all([
    prisma.influencer.findUnique({
      where: { id: influencerId },
      select: { id: true, username: true, displayName: true, email: true },
    }),
    prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true },
    }),
  ]);
  if (!influencer) {
    return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
  }
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (!influencer.email) {
    return NextResponse.json(
      { error: "Influencer has no email on file" },
      { status: 400 },
    );
  }

  const senderAccount = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });
  if (!senderAccount) {
    return NextResponse.json(
      { error: "Connect your email account in Settings first" },
      { status: 400 },
    );
  }

  const cleanedHashtags = Array.isArray(hashtags)
    ? Array.from(
        new Set(
          hashtags
            .map((h) => h.trim().replace(/^#/, ""))
            .filter(Boolean),
        ),
      )
    : [];
  const cleanedBody = briefBody.trim();
  const cleanedHowToPost = (howToPost ?? "").trim() || null;
  const cleanedNotes = (notes ?? "").trim() || null;
  const parsedUploadDate = uploadDate ? new Date(uploadDate) : null;
  const validUploadDate =
    parsedUploadDate && !Number.isNaN(parsedUploadDate.getTime()) ? parsedUploadDate : null;

  const brief = await prisma.contentBrief.create({
    data: {
      marketingCampaignId: campaign.id,
      influencerId: influencer.id,
      bodySnapshot: cleanedBody,
      howToPostSnapshot: cleanedHowToPost,
      hashtagsSnapshot: cleanedHashtags,
      uploadDate: validUploadDate,
      notes: cleanedNotes,
      sentByUserId: user.id,
    },
  });

  if (saveAsOverride) {
    await prisma.contentBriefOverride.upsert({
      where: {
        marketingCampaignId_influencerId: {
          marketingCampaignId: campaign.id,
          influencerId: influencer.id,
        },
      },
      update: {
        body: cleanedBody,
        howToPost: cleanedHowToPost,
        hashtags: cleanedHashtags,
      },
      create: {
        marketingCampaignId: campaign.id,
        influencerId: influencer.id,
        body: cleanedBody,
        howToPost: cleanedHowToPost,
        hashtags: cleanedHashtags,
        createdById: user.id,
      },
    });
  }

  await prisma.activityLog.create({
    data: {
      influencerId: influencer.id,
      type: "content_brief_sent",
      title: `Content brief sent — ${campaign.name}`,
      detail: `${user.email} sent brief to @${influencer.username}${saveAsOverride ? " (saved as override)" : ""}`,
    },
  });

  // Render to safe HTML — escape angle brackets, preserve newlines.
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  const greetingName = influencer.displayName || `@${influencer.username}`;
  const hashtagsHtml = cleanedHashtags.length
    ? `<p style="margin: 16px 0 0 0;"><strong>Hashtags:</strong> ${cleanedHashtags.map((h) => `#${h}`).join(" ")}</p>`
    : "";
  const howToPostSection = cleanedHowToPost
    ? `
      <div style="background: #fffaf0; border-left: 3px solid #d97706; padding: 14px 18px; border-radius: 6px; margin: 16px 0; font-size: 14px; line-height: 1.6;">
        <p style="margin: 0 0 6px 0; font-weight: 600; color: #92400e;">How to post</p>
        ${esc(cleanedHowToPost)}
      </div>
    `
    : "";
  const uploadDateSection = validUploadDate
    ? `
      <div style="background: #ecfdf5; border-left: 3px solid #059669; padding: 14px 18px; border-radius: 6px; margin: 16px 0; font-size: 14px;">
        <p style="margin: 0 0 4px 0; font-weight: 600; color: #065f46;">Upload date</p>
        <p style="margin: 0;">${validUploadDate.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>
    `
    : "";
  const notesSection = cleanedNotes
    ? `
      <div style="background: #f1f5f9; border-left: 3px solid #475569; padding: 14px 18px; border-radius: 6px; margin: 16px 0; font-size: 14px; line-height: 1.6;">
        <p style="margin: 0 0 6px 0; font-weight: 600; color: #1e293b;">Additional notes</p>
        ${esc(cleanedNotes)}
      </div>
    `
    : "";

  const transport = getSmtpTransport(senderAccount);
  try {
    await transport.sendMail({
      from: `"MIXSOON" <${senderAccount.emailAddress}>`,
      to: influencer.email,
      subject: `Content brief — ${campaign.name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="margin: 0 0 16px 0;">Content brief — ${campaign.name}</h2>
          <p>Hi ${greetingName},</p>
          <p>Here are the guidelines for your upcoming post:</p>
          <div style="background: #f9f9f9; border-left: 3px solid #0f172a; padding: 14px 18px; border-radius: 6px; margin: 16px 0; font-size: 14px; line-height: 1.6;">
            ${esc(cleanedBody)}
            ${hashtagsHtml}
          </div>
          ${howToPostSection}
          ${uploadDateSection}
          ${notesSection}
          <p style="margin-top: 24px;">No action needed — please follow the guidelines above and post on the scheduled date. Reply to this email if you have any questions.</p>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">— MIXSOON Team</p>
        </div>
      `,
    });
  } finally {
    transport.close();
  }

  return NextResponse.json({ success: true, briefId: brief.id });
}
