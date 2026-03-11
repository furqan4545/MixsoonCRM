import { prisma } from "@/app/lib/prisma";
import { ContractWizard } from "@/components/contract-wizard";

export default async function UnifiedSigningPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const record = await prisma.onboardingToken.findUnique({
    where: { token },
    include: {
      influencer: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
  });

  if (!record) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <span className="text-3xl">&#10060;</span>
        </div>
        <h1 className="text-2xl font-bold">Invalid Link</h1>
        <p className="text-muted-foreground">
          This signing link is invalid. Please contact your MIXSOON representative.
        </p>
      </div>
    );
  }

  if (record.usedAt) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
          <span className="text-3xl">&#9989;</span>
        </div>
        <h1 className="text-2xl font-bold">Already Completed</h1>
        <p className="text-muted-foreground">
          This contract has already been signed. If you need a copy, please contact your MIXSOON representative.
        </p>
      </div>
    );
  }

  if (record.expiresAt < new Date()) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
          <span className="text-3xl">&#9888;&#65039;</span>
        </div>
        <h1 className="text-2xl font-bold">Link Expired</h1>
        <p className="text-muted-foreground">
          This signing link has expired. Please contact your MIXSOON representative.
        </p>
      </div>
    );
  }

  if (record.type !== "CONTRACT" || !record.contractId) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <span className="text-3xl">&#10060;</span>
        </div>
        <h1 className="text-2xl font-bold">Invalid Link Type</h1>
        <p className="text-muted-foreground">
          This link is not for contract signing. Please use the correct link.
        </p>
      </div>
    );
  }

  const contract = await prisma.contract.findUnique({
    where: { id: record.contractId },
  });

  if (!contract) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <span className="text-3xl">&#10060;</span>
        </div>
        <h1 className="text-2xl font-bold">Contract Not Found</h1>
        <p className="text-muted-foreground">
          The contract associated with this link could not be found.
        </p>
      </div>
    );
  }

  const influencerName =
    record.influencer.displayName || record.influencer.username;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">
          Contract for {influencerName}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {contract.requireBankDetails || contract.requireShippingAddress
            ? "Please review and sign the contract below, then complete the additional steps."
            : "Please review the contract below and sign at the bottom."}
        </p>
      </div>
      <ContractWizard
        token={token}
        contractId={contract.id}
        htmlContent={contract.filledContent}
        influencerName={influencerName}
        requireBankDetails={contract.requireBankDetails}
        requireShippingAddress={contract.requireShippingAddress}
      />
    </div>
  );
}
