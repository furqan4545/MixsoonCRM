import { prisma } from "@/app/lib/prisma";
import { OnboardingForm } from "@/components/onboarding-form";

export default async function OnboardingPage({
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
          email: true,
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
          This onboarding link is invalid. Please contact your MIXSOON representative for a new link.
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
        <h1 className="text-2xl font-bold">Already Submitted</h1>
        <p className="text-muted-foreground">
          Your onboarding information has already been submitted. If you need to make changes, please contact your MIXSOON representative.
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
          This onboarding link has expired. Please contact your MIXSOON representative for a new link.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Welcome, {record.influencer.displayName || record.influencer.username}!</h1>
        <p className="mt-2 text-muted-foreground">
          Please fill out your bank details and shipping address to complete your onboarding.
        </p>
      </div>
      <OnboardingForm
        token={token}
        influencer={record.influencer}
      />
    </div>
  );
}
