import { prisma } from "@/app/lib/prisma";
import { ContentSubmissionForm } from "@/components/content-submission-form";

export default async function ContentSubmitPage({
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
          This link is invalid. Please contact your MIXSOON representative.
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
          This form has already been submitted. If you need to make changes, please contact your MIXSOON representative.
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
          This link has expired. Please contact your MIXSOON representative for a new one.
        </p>
      </div>
    );
  }

  if (record.type !== "CONTENT" && record.type !== "PAYMENT") {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <span className="text-3xl">&#10060;</span>
        </div>
        <h1 className="text-2xl font-bold">Invalid Link Type</h1>
        <p className="text-muted-foreground">
          This link is not for content submission. Please use the correct link.
        </p>
      </div>
    );
  }

  const influencerName =
    record.influencer.displayName || record.influencer.username;

  const isContentType = record.type === "CONTENT";
  const showPayment = record.type === "PAYMENT" || record.includePayment;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">
          {isContentType ? "Content Submission" : "Payment Details"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Hi {influencerName},{" "}
          {isContentType
            ? "please submit your video links below."
            : "please provide your payment details below."}
          {isContentType && showPayment
            ? " You can also add your payment information at the bottom."
            : ""}
        </p>
      </div>
      <ContentSubmissionForm
        token={token}
        influencerName={influencerName}
        showVideoLinks={isContentType}
        showPayment={showPayment}
        requireScode={record.requireScode}
        submissionLabel={record.submissionLabel ?? undefined}
      />
    </div>
  );
}
