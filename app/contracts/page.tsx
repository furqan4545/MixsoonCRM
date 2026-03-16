import { prisma } from "../lib/prisma";
import { ContractsPage } from "./contracts-page";

export const dynamic = "force-dynamic";

export default async function ContractsPageWrapper() {
  const [contracts, submissions] = await Promise.all([
    prisma.contract.findMany({
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
      },
    }),
    prisma.contentSubmission.findMany({
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
  ]);

  const serializedContracts = contracts.map((c) => ({
    id: c.id,
    status: c.status,
    pdfUrl: c.pdfUrl,
    signedPdfUrl: c.signedPdfUrl,
    signedAt: c.signedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    influencer: c.influencer,
    campaign: c.campaign,
    template: c.template,
  }));

  const serializedSubmissions = submissions.map((s) => ({
    id: s.id,
    videoLinks: s.videoLinks as string[],
    notes: s.notes,
    includePayment: s.includePayment,
    bankName: s.bankName,
    accountHolder: s.accountHolder,
    status: s.status,
    submittedAt: s.submittedAt?.toISOString() ?? null,
    verifiedAt: s.verifiedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    influencer: s.influencer,
  }));

  return (
    <ContractsPage
      contracts={serializedContracts}
      submissions={serializedSubmissions}
    />
  );
}
