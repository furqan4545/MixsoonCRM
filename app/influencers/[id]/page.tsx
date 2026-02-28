import { redirect } from "next/navigation";

// Redirect to the main influencers page — detail is now shown as a side panel
export default async function InfluencerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/influencers?selected=${id}`);
}
