import { prisma } from "../lib/prisma";
import { CampaignManager } from "./campaign-manager";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-6">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">
        Campaign Filters
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Save pre-filter rules (target/avoid keywords). Saved filters persist
        across page refresh and are reused in AI filtering runs.
      </p>
      <CampaignManager initialCampaigns={campaigns} />
    </div>
  );
}
