# Multi-stage Dockerfile for Next.js (standalone output) on Cloud Run.
# Avoid BuildKit-only syntax (--mount=type=cache, etc.) so it works with
# Cloud Build's default classic Docker daemon.

# ── deps ─────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
# --ignore-scripts skips the `postinstall: prisma generate` hook here. The
# builder stage runs `prisma generate` explicitly AFTER copying the full repo
# (so prisma/schema.prisma actually exists).
RUN npm ci --ignore-scripts

# ── builder ──────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma.config.ts requires DATABASE_URL to exist (it calls env() at load),
# but `prisma generate` doesn't actually connect. The real URL comes from
# Secret Manager at runtime; this placeholder just satisfies the config loader.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
# Call next build directly — the package.json "build" script does its own
# `npm ci` which would re-install everything we already have.
RUN npx next build

# ── runner ───────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app

# OS deps Next.js + Prisma + libreoffice-convert (used by contracts) need.
# libreoffice is ~600MB — drop the install if you don't use DOCX→PDF conversion.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates libreoffice fonts-noto-cjk fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# Non-root user
RUN groupadd --gid 1001 nodejs && useradd --uid 1001 --gid 1001 nextjs

# Pull the standalone output + static assets + public.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Prisma engines live in node_modules/@prisma — the standalone bundle copies
# what it traces, but we want the full client available at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
