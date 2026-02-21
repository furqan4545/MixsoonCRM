"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThumbnailImage } from "@/components/thumbnail-image";
import { startSaveImport } from "@/components/save-progress-bar";

function fixThumbnailUrl(url: string | null): string | null {
  if (!url) return null;
  return `/api/thumbnail?url=${encodeURIComponent(url)}`;
}

interface VideoData {
  id: string;
  username: string;
  title: string | null;
  views: number | null;
  bookmarks: number | null;
  uploadedAt: string | null;
  thumbnailUrl: string | null;
}

interface InfluencerData {
  id: string;
  username: string;
  profileUrl: string | null;
  biolink: string | null;
  followers: number | null;
  email: string | null;
  videos: VideoData[];
}

interface ImportData {
  id: string;
  sourceFilename: string;
  rowCount: number;
  processedCount: number;
  status: string;
  createdAt: string;
  influencers: InfluencerData[];
}

interface UploadResponse {
  id: string;
  sourceFilename: string;
  finalCount: number;
  toScrape: string[];
  toRescrape: string[];
  skipped: string[];
  videoCount: number;
}

type Step = "upload" | "confirm" | "processing" | "results";

export default function DataScraperPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [usernameLimit, setUsernameLimit] = useState<number>(50);
  const [videoCount, setVideoCount] = useState<number>(20);
  const [importData, setImportData] = useState<ImportData | null>(null);
  const [uploadResponse, setUploadResponse] = useState<UploadResponse | null>(
    null,
  );
  const [progress, setProgress] = useState("");
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressUsername, setProgressUsername] = useState("");
  const [error, setError] = useState("");
  const [refreshSkippedProfiles, setRefreshSkippedProfiles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/imports/cleanup-drafts", { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const completedId = (e as CustomEvent<string>).detail;
      if (importData && completedId === importData.id) {
        setSaved(true);
        setSaving(false);
      }
    };
    window.addEventListener("save-import-complete", handler);
    return () => window.removeEventListener("save-import-complete", handler);
  }, [importData]);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setError("");
    setProgress("Uploading CSV...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("usernameLimit", String(usernameLimit));
      formData.append("videoCount", String(videoCount));

      const uploadRes = await fetch("/api/imports", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error ?? "Upload failed");
      }

      const data: UploadResponse = await uploadRes.json();
      setUploadResponse(data);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [file, usernameLimit, videoCount]);

  const handleStartScraping = useCallback(async () => {
    if (!uploadResponse) return;
    setError("");
    setStep("processing");
    setProgress("Starting scrape...");
    setProgressCurrent(0);
    const totalToProcess = refreshSkippedProfiles
      ? uploadResponse.toScrape.length +
        uploadResponse.toRescrape.length +
        uploadResponse.skipped.length
      : uploadResponse.toScrape.length + uploadResponse.toRescrape.length;
    setProgressTotal(totalToProcess);
    setProgressUsername("");

    try {
      const scrapeRes = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importId: uploadResponse.id,
          toScrape: uploadResponse.toScrape,
          toRescrape: uploadResponse.toRescrape,
          skipped: uploadResponse.skipped,
          videoCount: uploadResponse.videoCount,
          refreshSkippedProfiles,
        }),
      });

      if (!scrapeRes.ok) {
        const err = await scrapeRes.json();
        throw new Error(err.error ?? err.details ?? "Scraping failed");
      }

      const contentType = scrapeRes.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        await scrapeRes.json();
        setProgress("Loading results...");
        const resultRes = await fetch(`/api/imports/${uploadResponse.id}`);
        const resultData: ImportData = await resultRes.json();
        setImportData(resultData);
        setStep("results");
        return;
      }

      const reader = scrapeRes.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.type === "progress") {
                setProgressCurrent(payload.processed);
                setProgressTotal(payload.total);
                setProgressUsername(payload.username ?? "");
                setProgress(
                  `Scraping @${payload.username ?? "..."} (${payload.processed} / ${payload.total})`,
                );
              } else if (payload.type === "debug") {
                console.log(
                  "[Apify channel sample]",
                  payload.username,
                  {
                    channelKeys: payload.channelKeys,
                    bio: payload.bio,
                    rawBioLink: payload.rawBioLink,
                    fromBio: payload.fromBio,
                    bioLinkUrl: payload.bioLinkUrl,
                  },
                );
              } else if (payload.type === "complete") {
                setProgress("Scraping complete! Loading results...");
                const resultRes = await fetch(
                  `/api/imports/${uploadResponse.id}`,
                );
                const resultData: ImportData = await resultRes.json();
                setImportData(resultData);
                setStep("results");
                return;
              } else if (payload.type === "error") {
                throw new Error(payload.error ?? "Scraping failed");
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      }

      setProgress("Loading results...");
      const resultRes = await fetch(`/api/imports/${uploadResponse.id}`);
      const resultData: ImportData = await resultRes.json();
      setImportData(resultData);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("confirm");
    }
  }, [uploadResponse, refreshSkippedProfiles]);

  const handleSave = useCallback(async () => {
    if (!importData) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/imports/${importData.id}/save`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save");
      }
      startSaveImport(importData.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save import");
      setSaving(false);
    }
  }, [importData]);

  const handleDiscard = useCallback(async () => {
    if (!importData) return;
    setError("");
    try {
      await fetch(`/api/imports/${importData.id}/delete-with-data`, {
        method: "DELETE",
      });
      setStep("upload");
      setFile(null);
      setImportData(null);
      setUploadResponse(null);
      setSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discard import");
    }
  }, [importData]);

  const toScrapeCount = uploadResponse?.toScrape.length ?? 0;
  const toRescrapeCount = uploadResponse?.toRescrape.length ?? 0;
  const skippedCount = uploadResponse?.skipped.length ?? 0;
  const hasWork =
    toScrapeCount + toRescrapeCount > 0 ||
    (refreshSkippedProfiles && skippedCount > 0);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Data Scraper</h1>
        <p className="text-sm text-muted-foreground">
          Upload a CSV with TikTok usernames to scrape influencer data.
        </p>
      </div>

      {/* Upload Step */}
      {step === "upload" && (
        <div className="mx-auto max-w-xl">
          <div className="rounded-xl border bg-card p-8">
            <h2 className="mb-6 text-lg font-semibold">
              Import TikTok Influencers
            </h2>

            <label
              htmlFor="csv-upload"
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border px-6 py-10 transition-colors hover:border-muted-foreground/50"
            >
              <svg
                className="mb-3 h-10 w-10 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <span className="text-sm font-medium">
                {file ? file.name : "Click to upload CSV"}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                Must contain a &quot;Username&quot; column
              </span>
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="username-limit"
                  className="mb-1 block text-sm font-medium"
                >
                  Username Limit
                </label>
                <input
                  id="username-limit"
                  type="number"
                  value={usernameLimit}
                  onChange={(e) => setUsernameLimit(Number(e.target.value))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  -1 for all usernames
                </span>
              </div>
              <div>
                <label
                  htmlFor="video-count"
                  className="mb-1 block text-sm font-medium"
                >
                  Videos per User
                </label>
                <input
                  id="video-count"
                  type="number"
                  value={videoCount}
                  onChange={(e) => setVideoCount(Number(e.target.value))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Thumbnails per influencer
                </span>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              onClick={handleUpload}
              disabled={!file}
              className="mt-6 w-full"
              size="lg"
            >
              Upload CSV
            </Button>
          </div>
        </div>
      )}

      {/* Confirm Step — breakdown before scraping */}
      {step === "confirm" && uploadResponse && (
        <div className="mx-auto max-w-xl">
          <div className="rounded-xl border bg-card p-8">
            <h2 className="mb-4 text-lg font-semibold">
              Ready to scrape
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {uploadResponse.sourceFilename} — {uploadResponse.finalCount}{" "}
              usernames, up to {uploadResponse.videoCount} videos each.
            </p>

            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">New usernames to scrape</span>
                <Badge variant="default">{toScrapeCount}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Need more videos</span>
                <Badge variant="secondary">{toRescrapeCount}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Already complete (skipped)</span>
                <Badge variant="outline">{skippedCount}</Badge>
              </div>
            </div>

            {(skippedCount > 0 || toRescrapeCount > 0) && (
              <label className="mt-4 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={refreshSkippedProfiles}
                  onChange={(e) => setRefreshSkippedProfiles(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-sm">
                  Delete all existing data and re-scrape everything fresh (
                  {toScrapeCount + toRescrapeCount + skippedCount} total)
                </span>
              </label>
            )}

            {error && (
              <div className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setStep("upload");
                  setUploadResponse(null);
                  setError("");
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleStartScraping}
                disabled={!hasWork}
              >
                {hasWork
                  ? refreshSkippedProfiles && skippedCount > 0
                    ? `Start (${toScrapeCount + toRescrapeCount + skippedCount} influencers)`
                    : "Start Scraping"
                  : "Nothing to scrape (all skipped)"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Processing Step — real-time progress */}
      {step === "processing" && (
        <div className="mx-auto max-w-xl">
          <div className="rounded-xl border bg-card p-8 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <h2 className="text-lg font-semibold">Scraping...</h2>
            <p className="mt-2 text-sm text-muted-foreground">{progress}</p>
            {progressTotal > 0 && (
              <>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{
                      width: `${Math.round((progressCurrent / progressTotal) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {progressCurrent} / {progressTotal} influencers
                  {progressUsername ? ` — @${progressUsername}` : ""}
                </p>
              </>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              This may take several minutes. Do not close this page.
            </p>
          </div>
        </div>
      )}

      {/* Results Step */}
      {step === "results" && importData && (
        <div>
          <div className="mb-6 flex items-center justify-between rounded-xl border bg-card px-6 py-4">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  File
                </span>
                <p className="text-sm font-semibold">
                  {importData.sourceFilename}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Influencers
                </span>
                <p className="text-sm font-semibold">
                  {importData.processedCount}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Status
                </span>
                <Badge
                  variant={
                    saved ? "default" : saving ? "outline" : "secondary"
                  }
                >
                  {saved
                    ? "SAVED"
                    : saving
                      ? "SAVING TO CLOUD…"
                      : "Scraping done — review & save"}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {error && (
                <span className="text-sm text-destructive">{error}</span>
              )}
              {saved ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/imports/${importData.id}`)}
                  >
                    View in Imports
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep("upload");
                      setFile(null);
                      setImportData(null);
                      setUploadResponse(null);
                      setSaved(false);
                    }}
                  >
                    New Import
                  </Button>
                </>
              ) : saving ? (
                <span className="text-sm text-muted-foreground">
                  Saving in background — you can navigate away
                </span>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={handleDiscard}
                  >
                    Discard
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    Save Import
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {importData.influencers.map((influencer) => (
              <div
                key={influencer.id}
                className="overflow-hidden rounded-xl border bg-card"
              >
                <div className="flex items-center gap-4 border-b px-6 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold">
                    {influencer.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">
                        @{influencer.username}
                      </h3>
                      {influencer.profileUrl && (
                        <a
                          href={influencer.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          TikTok
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {influencer.followers != null && (
                        <span>
                          {influencer.followers.toLocaleString()} followers
                        </span>
                      )}
                      {influencer.email && <span>{influencer.email}</span>}
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {influencer.videos.length} videos
                  </Badge>
                </div>

                {influencer.videos.length > 0 && (
                  <div className="p-4">
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                      {influencer.videos.map((video) => (
                        <div
                          key={video.id}
                          className="group relative aspect-9/16 overflow-hidden rounded-lg bg-muted"
                        >
                          {video.thumbnailUrl ? (
                            <ThumbnailImage
                              src={fixThumbnailUrl(video.thumbnailUrl)!}
                              alt={video.title ?? "Video thumbnail"}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                              No thumb
                            </div>
                          )}
                          <div className="absolute inset-0 flex flex-col justify-end bg-linear-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                            <p className="truncate text-[10px] font-medium text-white">
                              {video.title ?? "Untitled"}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-300">
                              {video.views != null && (
                                <span>
                                  {video.views.toLocaleString()} views
                                </span>
                              )}
                              {video.bookmarks != null && (
                                <span>
                                  {video.bookmarks.toLocaleString()} saves
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
