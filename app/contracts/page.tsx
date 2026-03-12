import { prisma } from "../lib/prisma";
import { ContractsPage } from "./contracts-page";

export const dynamic = "force-dynamic";

export default async function ContractsPageWrapper() {
  const contracts = await prisma.contract.findMany({
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
  });

  // Serialize dates for client component
  const serialized = contracts.map((c) => ({
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

  return <ContractsPage contracts={serialized} />;
}
