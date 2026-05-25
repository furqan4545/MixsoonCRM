#!/usr/bin/env bash
# Deploy Mixsoon to Cloud Run.
#
# One-time prep (run once, manually — these are billing/IAM actions):
#
#   gcloud auth login
#   gcloud config set project mixsoon-data
#
#   # APIs we need
#   gcloud services enable \
#     run.googleapis.com \
#     artifactregistry.googleapis.com \
#     cloudbuild.googleapis.com \
#     secretmanager.googleapis.com \
#     vpcaccess.googleapis.com
#
#   # Artifact Registry repo for our Docker images
#   gcloud artifacts repositories create mixsoon \
#     --repository-format=docker \
#     --location="${REGION}" \
#     --description="Mixsoon container images"
#
#   # Move secrets out of .env into Secret Manager
#   printf '%s' 'postgresql://postgres:CHANGE_ME@<internal-ip>:5432/mixsoon' \
#     | gcloud secrets create database-url --data-file=-
#   printf '%s' '<your-apify-key>'   | gcloud secrets create apify-api-key --data-file=-
#   printf '%s' '<your-gemini-key>'  | gcloud secrets create gemini-api-key --data-file=-
#   printf '%s' '<openai-key>'       | gcloud secrets create openai-api-key --data-file=-
#   printf '%s' '<resend-or-smtp>'   | gcloud secrets create smtp-config --data-file=-
#   # ... one per secret in .env. Grant the runtime SA access:
#   for s in database-url apify-api-key gemini-api-key openai-api-key smtp-config; do
#     gcloud secrets add-iam-policy-binding "$s" \
#       --member="serviceAccount:${RUNTIME_SA}" \
#       --role="roles/secretmanager.secretAccessor"
#   done
#
#   # VPC connector — lets Cloud Run reach the Postgres VM over its INTERNAL ip.
#   # Replace 10.8.0.0/28 with a /28 in your VPC that's free.
#   gcloud compute networks vpc-access connectors create mixsoon-connector \
#     --region="${REGION}" \
#     --range=10.8.0.0/28 \
#     --network=default
#
# Then run THIS script every deploy:
#
#   ./scripts/deploy-cloudrun.sh

set -euo pipefail

# ── Required: fill these in ────────────────────────────────────────────────
PROJECT_ID="mixsoon-data"
REGION="${REGION:-us-central1}"          # ← matches your Postgres VM zone us-central1-c
SERVICE_NAME="${SERVICE_NAME:-mixsoon-transpify}"
GCS_BUCKET="mixsoon_crm_data_bucket"     # from your .env
RUNTIME_SA="${RUNTIME_SA:-mixsoon-crm-storage-uploader@mixsoon-data.iam.gserviceaccount.com}"
# VPC connector is optional for the first deploy — skip it and use the public
# Postgres IP. Set VPC_CONNECTOR=mixsoon-connector once you've created one.
VPC_CONNECTOR="${VPC_CONNECTOR:-}"
# Public URL of the Cloud Run service — REQUIRED for Auth.js redirects (signOut,
# OAuth callbacks, etc.). Without it, redirects target 0.0.0.0:8080 (the
# internal bind address). Override at the env-var level if you move to a custom
# domain (e.g. PUBLIC_URL=https://app.mixsoon.com ./scripts/deploy-cloudrun.sh).
PUBLIC_URL="${PUBLIC_URL:-https://mixsoon-transpify-kaomleevya-uc.a.run.app}"

# ── Image tag = git short SHA so deploys are traceable ─────────────────────
IMAGE_TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d-%H%M%S)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/mixsoon/web:${IMAGE_TAG}"

echo "→ Project:  ${PROJECT_ID}"
echo "→ Region:   ${REGION}"
echo "→ Service:  ${SERVICE_NAME}"
echo "→ Image:    ${IMAGE}"
echo

# ── Build image via Cloud Build (no local Docker needed) ───────────────────
echo "→ Building image with Cloud Build…"
gcloud builds submit \
  --project="${PROJECT_ID}" \
  --tag="${IMAGE}" \
  --timeout=1200s \
  .

# ── Deploy revision ────────────────────────────────────────────────────────
echo "→ Deploying to Cloud Run…"

VPC_ARGS=()
if [[ -n "${VPC_CONNECTOR}" ]]; then
  VPC_ARGS=(--vpc-connector="${VPC_CONNECTOR}" --vpc-egress=private-ranges-only)
fi

gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --service-account="${RUNTIME_SA}" \
  ${VPC_ARGS[@]+"${VPC_ARGS[@]}"} \
  --cpu=2 \
  --memory=2Gi \
  --concurrency=80 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=3600 \
  --allow-unauthenticated \
  --port=8080 \
  --set-env-vars="NODE_ENV=production,GCS_BUCKET_NAME=mixsoon_crm_data_bucket,GEMINI_MODEL=gemini-2.5-flash,AUTH_TRUST_HOST=true,AUTH_URL=${PUBLIC_URL},NEXTAUTH_URL=${PUBLIC_URL},NEXT_PUBLIC_APP_URL=${PUBLIC_URL}" \
  --set-secrets="DATABASE_URL=database-url:latest,APIFY_API_KEY=apify-api-key:latest,GEMINI_API_KEY=gemini-api-key:latest,AUTH_SECRET=auth-secret:latest,EMAIL_ENCRYPTION_KEY=email-encryption-key:latest,GCP_SERVICE_ACCOUNT_JSON=gcp-service-account-json:latest"

echo
echo "✓ Deployed. Service URL:"
gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)'
