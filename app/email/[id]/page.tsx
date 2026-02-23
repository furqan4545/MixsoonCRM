import { EmailDetail } from "@/components/email-detail";

export default async function EmailDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmailDetail emailId={id} />;
}
