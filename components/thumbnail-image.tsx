"use client";

import { useState } from "react";

interface ThumbnailImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  fallbackText?: string;
}

export function ThumbnailImage({
  src,
  alt,
  className,
  loading = "lazy",
  fallbackText = "No thumb",
}: ThumbnailImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center bg-muted text-xs text-muted-foreground">
        {fallbackText}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
      loading={loading}
      onError={() => setFailed(true)}
    />
  );
}
