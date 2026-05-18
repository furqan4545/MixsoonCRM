import { prisma } from "../lib/prisma";
import { decrypt } from "../lib/crypto";
import { getCurrentUser } from "../lib/rbac";
import { isAdminIsolationEnabled } from "../lib/ownership";
import { ContractsPage } from "./contracts-page";

export const dynamic = "force-dynamic";

export default async function ContractsPageWrapper() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "Admin";
  const adminIsolated = await isAdminIsolationEnabled();
  const restrict = (!isAdmin || adminIsolated) && !!user?.id;

  // Per-user isolation: filter contracts + submissions by ownership
  let contractWhere: Record<string, unknown> | undefined;
  let submissionWhere: Record<string, unknown> | undefined;
  if (restrict && user?.id) {
    const [contractShares, submissionShares] = await Promise.all([
      prisma.resourceShare.findMany({
        where: { userId: user.id, resourceType: "Contract" },
        select: { resourceId: true },
      }),
      prisma.resourceShare.findMany({
        where: { userId: user.id, resourceType: "ContentSubmission" },
        select: { resourceId: true },
      }),
    ]);
    const sharedContractIds = contractShares.map((s) => s.resourceId);
    const sharedSubmissionIds = submissionShares.map((s) => s.resourceId);
    contractWhere = {
      OR: [
        { createdById: user.id },
        ...(sharedContractIds.length > 0 ? [{ id: { in: sharedContractIds } }] : []),
      ],
    };
    submissionWhere = {
      OR: [
        { createdById: user.id },
        ...(sharedSubmissionIds.length > 0 ? [{ id: { in: sharedSubmissionIds } }] : []),
      ],
    };
  }

  // Briefs follow the same ownership rules: created-by OR shared.
  let briefWhere: Record<string, unknown> | undefined;
  if (restrict && user?.id) {
    const briefShares = await prisma.resourceShare.findMany({
      where: { userId: user.id, resourceType: "ContentBrief" },
      select: { resourceId: true },
    });
    const sharedBriefIds = briefShares.map((s) => s.resourceId);
    briefWhere = {
      OR: [
        { sentByUserId: user.id },
        ...(sharedBriefIds.length > 0 ? [{ id: { in: sharedBriefIds } }] : []),
      ],
    };
  }

  const [contracts, submissions, briefs] = await Promise.all([
    prisma.contract.findMany({
      where: contractWhere,
      orderBy: { createdAt: "desc" },
      include: {
        influencer: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
        campaign: {
          select: { id: true, name: true },
        },
        template: {
          select: { id: true, name: true },
        },
        adminSignedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
    prisma.contentSubmission.findMany({
      where: submissionWhere,
      orderBy: { createdAt: "desc" },
      include: {
        influencer: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    }),
    prisma.contentBrief.findMany({
      where: briefWhere,
      orderBy: { sentAt: "desc" },
      include: {
        influencer: { select: { id: true, username: true, displayName: true } },
        marketingCampaign: { select: { id: true, name: true } },
        sentByUser: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const serializedContracts = contracts.map((c) => ({
    id: c.id,
    status: c.status,
    pdfUrl: c.pdfUrl,
    signedPdfUrl: c.signedPdfUrl,
    signedAt: c.signedAt?.toISOString() ?? null,
    adminSignatureUrl: c.adminSignatureUrl,
    adminSignedAt: c.adminSignedAt?.toISOString() ?? null,
    adminSignedBy: c.adminSignedBy,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    influencer: c.influencer,
    campaign: c.campaign,
    template: c.template,
  }));

  const serializedSubmissions = submissions.map((s) => ({
    id: s.id,
    videoLinks: s.videoLinks as string[],
    videoFiles: (s.videoFiles as Array<{ gcsPath: string; name: string; size: number; type: string }>) ?? [],
    notes: s.notes,
    sCode: s.sCode,
    submissionLabel: s.submissionLabel,
    includePayment: s.includePayment,
    bankName: s.bankName,
    accountNumber: s.accountNumber ? (() => { try { return decrypt(s.accountNumber); } catch { return null; } })() : null,
    accountHolder: s.accountHolder,
    bankCode: s.bankCode,
    status: s.status,
    submittedAt: s.submittedAt?.toISOString() ?? null,
    verifiedAt: s.verifiedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    influencer: s.influencer,
  }));

  const serializedBriefs = briefs.map((b) => ({
    id: b.id,
    bodySnapshot: b.bodySnapshot,
    howToPostSnapshot: b.howToPostSnapshot,
    hashtagsSnapshot: b.hashtagsSnapshot,
    uploadDate: b.uploadDate?.toISOString() ?? null,
    notes: b.notes,
    sentAt: b.sentAt.toISOString(),
    sentBy: b.sentByUser,
    campaign: b.marketingCampaign,
    influencer: b.influencer,
  }));

  return (
    <ContractsPage
      contracts={serializedContracts}
      submissions={serializedSubmissions}
      briefs={serializedBriefs}
      isAdmin={isAdmin}
    />
  );
}
