# MIXSOON Influencer Management Platform - Requirements v2 (Phases 1-6)

> Rewritten based on original spec + client meeting feedback (March 2026)
> This document is the single source of truth for what needs to be built.

---

## Tech Stack

- **Framework**: Next.js 16 + React 19 (App Router)
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: NextAuth v5 (JWT sessions, credentials provider)
- **Email**: IMAP/SMTP (imapflow, nodemailer)
- **AI**: Google Gemini 2.0 Flash
- **Storage**: Google Cloud Storage
- **Scraping**: Apify (TikTok data)
- **UI**: Tailwind CSS + shadcn/ui + Radix

---

## PHASE 1: Foundation & Data Import

### 1.1 CSV/Excel Upload Engine

**What it does**: Users upload CSV/Excel files containing influencer usernames. The system parses usernames, deduplicates against existing data, and triggers video scraping via Apify.

**Current status**: IMPLEMENTED

**Data flow**:
1. User uploads file at `/data-scraper`
2. System parses file, extracts usernames from "Username" column (or auto-detects)
3. Creates `Import` record (status: PENDING)
4. Triggers Apify scraper for each username → fetches videos, stats, bio, avatar
5. Creates `Influencer` + `Video` records
6. Import moves through: PENDING → PROCESSING → DRAFT → COMPLETED

**API**:
- `POST /api/imports` — upload file
- `POST /api/scrape` — trigger Apify scraping
- `POST /api/imports/[id]/save` — save scraped data to DB
- `GET /api/imports/[id]/save/status` — poll save progress

**Database models**: `Import`, `Influencer`, `Video`

### 1.2 Role-Based Access Control (RBAC)

**What it does**: Feature-level permissions per user role. Three default roles: Admin (full access), PIC (read/write most features), Viewer (read-only).

**Current status**: IMPLEMENTED

**Roles & default permissions**:
| Feature | Admin | PIC | Viewer |
|---------|-------|-----|--------|
| imports | read/write/delete | read/write | read |
| influencers | read/write | read/write | read |
| ai-filter | read/write | read/write | read |
| approvals | read/write | read/write | read |
| contracts | read/write | read/write | read |
| campaigns | read/write | read/write | read |
| email | read/send | read/send | — |
| alerts | read/write | read | read |
| admin | users/roles | — | — |

**User registration flow**: Register → status=PENDING → Admin approves → status=ACTIVE

**Database models**: `User`, `Role`, `Permission`

### 1.3 Database Schema

**Current status**: IMPLEMENTED (needs additions — see Phase 2 & 3 gaps)

---

## PHASE 2: Influencer Scouting & AI Scoring

### 2.1 Influencer Data Model

**What it does**: Each influencer has a profile with contact info, social stats, CRM fields, AI scores, and associated videos.

**Current status**: PARTIALLY IMPLEMENTED — missing several fields from client feedback

#### Current fields on `Influencer`:
- `username`, `displayName`, `profileUrl`, `avatarUrl`
- `biolink` (raw bio text), `bioLinkUrl` (extracted URL)
- `followers`, `engagementRate`, `email`, `phone`
- `platform`, `country`, `rate`, `pipelineStage`
- `tags[]`, `notes`, `aiScore`
- `socialLinks` (JSON)

#### MISSING fields (from client meeting):

| Field | Type | Description | Priority |
|-------|------|-------------|----------|
| `language` | String? | Primary language used in video content (detected from captions) | HIGH |
| `countryOfResidence` | String? | Actual country where influencer lives. Initially null — manually updated after contact. Separate from `country` which may be audience-based. | HIGH |
| `audienceCountries` | Json? | Audience geographic breakdown, e.g. `[{"country":"US","percentage":20},{"country":"FR","percentage":30}]`. Populated manually or from Exolyt data. | MEDIUM |
| `audienceLanguage` | String? | Primary language of audience (from comments/engagement). | MEDIUM |
| `lastPostedAt` | DateTime? | Date of most recent video. Used to determine if account is active. | HIGH |
| `isStarred` | Boolean | CEO "star" / favorite flag for significant influencers | HIGH |
| `picUserId` | String? | Assigned PIC (Person In Charge) for this influencer | HIGH |
| `sparkCode` | String? | TikTok Spark Ads code provided by influencer | MEDIUM |

**Client feedback context**:
- Language detection: TikTok doesn't expose country data reliably. Detect language from video captions instead. This helps determine likely audience region.
- Country of residence: Can only be known after direct communication. Must be manually editable. Critical for shipping products and filtering campaigns by region.
- Last posted date: Used as activity indicator. If >30 days since last post, account may be inactive. Should be filterable in AI scoring.
- Star flag: CEO wants to bookmark noteworthy influencers for future campaigns.
- PIC assignment: Each influencer should be assigned to a specific team member who manages the relationship.

### 2.2 AI Scoring Engine

**What it does**: Batch-process influencers through AI (Gemini) to score relevance (0-100) and categorize into buckets.

**Current status**: IMPLEMENTED

**Scoring flow**:
1. User creates AI Campaign (target keywords, avoid keywords, strictness 0-100)
2. Selects influencers from an import
3. System runs pre-filter (keyword matching)
4. Calls Gemini API with influencer bio, video captions, thumbnails
5. Returns score 0-100, maps to bucket:
   - APPROVED (75+)
   - OKISH (45-74)
   - REJECTED (<45)
   - REVIEW_QUEUE (edge cases)

**Database models**: `Campaign` (AI campaign), `AiFilterRun`, `InfluencerAiEvaluation`

### 2.3 AI Filter Queue Management

**What it does**: After AI scoring, users review results and manually override categorizations.

**Current status**: PARTIALLY IMPLEMENTED — missing key features from client feedback

#### What works:
- View scored influencers grouped by bucket (Approved / OKish / Rejected)
- Bulk move between buckets
- Review queue for edge cases

#### MISSING features (from client meeting):

**A) Thumbnail display in queue**
- Each influencer in the AI filter results must show video thumbnails
- Users do "visual fit check" by looking at thumbnails before approving
- Clicking a thumbnail should show the full video details

**B) Manual override of AI decisions**
- Uncheck/deselect specific influencers from any bucket
- Move individual influencers: Rejected → Approved, OKish → Approved, etc.
- The client said: "uncheck some influencers that are not like we don't want them to be rejected"

**C) Trash system (replaces "Unscored" concept)**
- When users delete rejected influencers from the queue, they go to a "Removed" / "Trash" bucket — NOT permanently deleted
- Trash bucket is visible as a separate tab
- Users can restore from trash back to any bucket
- "Empty trash" button to permanently delete all trashed influencers
- Future enhancement: configurable auto-empty period (7 days default, adjustable in settings)
- Rationale: "In case we accidentally deleted the right influencer and want to go back"

**D) Activity/recency filter in AI scoring**
- Add optional field: "Must have posted within X days" (default: 30 days)
- AI prompt should check `lastPostedAt` and reject inactive accounts
- Display days since last post in the influencer card within the queue

**E) Sync between import flow and CRM pipeline**
- CRITICAL BUG: Currently the flow from Import → AI Filter → Influencer Pipeline is disconnected
- After AI filtering and approval, approved influencers should automatically appear in the Influencers tab with correct pipeline stage (PROSPECT)
- The "save" action from AI filter should create/update influencer records in the main CRM
- Filter tabs in Influencers page should show: All | Approved | OKish | Rejected | Removed(Trash)

### 2.4 Email & Biolink Collection

**What it does**: Extract contact information from influencer profiles during scraping.

**Current status**: PARTIALLY IMPLEMENTED

**What works**:
- Email extracted from bio if plaintext
- Bio text stored in `biolink` field

**MISSING**:
- **Linktree/bio link extraction**: If influencer has a link in their TikTok bio (linktree, beacons, etc.), extract and store in `bioLinkUrl`. TikTok API may not provide this directly — may need secondary scraping.
- **Link display in profile**: Show clickable bio link in influencer detail panel so PIC can manually visit and find email/contact info
- Client said: "As long as we can just click something so we can just go straight to their social media"

---

## PHASE 3: CRM Pipeline & Campaign Management

### 3.1 Pipeline View

**What it does**: Manage influencers through stages: PROSPECT → OUTREACH → NEGOTIATING → CONTRACTED → COMPLETED

**Current status**: IMPLEMENTED

**Pipeline stages**:
```
PROSPECT → OUTREACH → NEGOTIATING → CONTRACTED → COMPLETED
```

**Each stage shows**: Influencer count, list of influencers, ability to move between stages

### 3.2 Influencer Profile (Detail Panel)

**What it does**: Comprehensive view of a single influencer with all data, communication, documents.

**Current status**: IMPLEMENTED but needs additions

**Existing tabs/sections**:
- Contact info (email, phone, social links)
- Social stats (followers, engagement rate)
- Videos (scraped from TikTok)
- Conversations (email threads)
- Notes (internal team notes)
- Documents (contracts)
- Activity timeline

**MISSING sections/fields (from client meeting)**:

| Section | What to add | Details |
|---------|-------------|---------|
| Profile header | Star/favorite toggle | CEO can star important influencers |
| Profile header | PIC assignment | Show assigned PIC avatar, allow reassignment |
| Profile header | Language badge | Show detected content language |
| Contact info | Country of residence | Editable text field, separate from content country |
| Contact info | Bio link (clickable) | Direct link to linktree/bio URL |
| Stats section | Last posted date | "X days ago" with warning if >30 days |
| Stats section | Audience countries | Percentage breakdown (manual entry) |
| Stats section | Audience language | Manual entry field |
| Videos section | Days since last post | Visible at bottom of video list |
| Pipeline section | Campaign association | Which campaign(s) this influencer belongs to |
| New section | Spark Code | Text field for TikTok Spark Ads code |

### 3.3 Campaign Management

**What it does**: Create marketing campaigns, assign influencers, track budgets and timelines.

**Current status**: IMPLEMENTED but needs PIC and bulk features

**What works**:
- Create campaigns (name, description, budget, dates, status)
- Assign individual influencers to campaigns
- Campaign statuses: PLANNING → ACTIVE → PAUSED → COMPLETED
- View influencers per campaign

**MISSING features (from client meeting)**:

**A) PIC Assignment per campaign**
- Add PICs (team members) to a campaign
- Multiple PICs per campaign
- PIC avatars visible on campaign card and influencer cards
- Only assigned PICs see notifications for that campaign's influencers

**B) Bulk influencer assignment**
- Filter influencers by country/language/tags before assigning
- Select all filtered results
- Assign all selected to a campaign in one action
- Client said: "filter those and import to the campaign tab, all [country] ones"

**C) Shared visibility**
- All team members can see the same influencer list and campaigns
- Conversations (emails) are hidden from non-assigned PICs
- Notes, videos, documents visible to all team members
- Client will provide detailed access list per section later

**Database changes needed**:
- Add `CampaignPic` model (many-to-many: campaign ↔ user)
- Add `picUserId` to `Influencer` model
- Add `picUserId` to `CampaignInfluencer` model

### 3.4 Search & Filters

**What it does**: Find influencers and campaigns across the platform.

**Current status**: IMPLEMENTED (basic search by name/handle/email)

**MISSING filters**:
- Filter by language
- Filter by country of residence
- Filter by audience country
- Filter by last posted date (active/inactive)
- Filter by starred status
- Filter by assigned PIC
- Filter by campaign

---

## PHASE 4: Communication & Internal Approvals

### 4.1 Email Integration (Gmail/HiWork via IMAP/SMTP)

**What it does**: Connect user's email account, sync messages, send/receive within the platform.

**Current status**: IMPLEMENTED

**What works**:
- IMAP/SMTP account connection
- Email sync (pull from inbox)
- Send emails from dashboard
- Thread grouping (Message-ID / In-Reply-To)
- Attachments (upload/download via GCS)
- Email signature editor
- Email templates
- Link emails to influencer profiles
- Folder management (Inbox, Sent, Drafts, Spam, Trash)

**One account per user**: Confirmed by client — no need for multi-account support. Each PIC connects their own Gmail or HiWork account.

**KNOWN BUGS**:
- Email reply sync not working reliably (client sent reply from Gmail, didn't appear in platform)
- Need to investigate and fix IMAP sync for incoming replies

**MISSING features (from client meeting)**:

**A) Configurable email sync period**
- Currently hard-coded to 2 weeks of email history
- Client wants: configurable period (default 2 months)
- Add setting in email settings page: "Sync emails from: [date picker or dropdown: 2 weeks / 1 month / 2 months / 3 months / 6 months]"

**B) AI email drafting improvements**
- Current: generates draft based on influencer's video content
- Need: configurable system prompt / template for AI drafts
- User should be able to set a default AI prompt that applies to all generated emails

### 4.2 Multi-Layer Follow-up Alerts

**What it does**: Automated follow-up system when influencers don't respond.

**Current status**: PARTIALLY IMPLEMENTED (single-layer only)

**What works**:
- Single alert: "remind after X days if no reply"
- Alert shows in dashboard
- Auto-sends follow-up email

**MISSING (from client meeting)**:

**Multi-layer alert chains**:
- After sending initial email, if no reply in 3 days → send follow-up #1
- If still no reply after 7 more days → send follow-up #2
- If still no reply after 14 more days → send follow-up #3
- Each layer can have its own email template
- Client said: "We definitely would need that because we need to get back the reply until they get back to us"

**Database changes needed**:
- Current `EmailAlert` supports single threshold. Need to support chained alerts.
- Option A: Add `parentAlertId` for chaining
- Option B: Add `alertSequence` JSON field with multiple steps
- Recommended: Create `EmailAlertChain` model with ordered steps

### 4.3 Internal Approval Workflow

**What it does**: PIC submits influencer rate/terms for CEO approval. CEO can approve, reject, or counter-offer. Back-and-forth negotiation.

**Current status**: IMPLEMENTED

**What works**:
- PIC submits: rate, currency, videos/bundle, $/video, total price, notes
- CEO reviews: approve / reject / counter-offer
- Counter-offer flow: CEO sends counter → PIC re-negotiates → re-submits
- Feedback statuses: REQUESTED → CEO_REVIEWED → APPLIED → SPECIAL
- Contract statuses: NEGOTIATE → APPROVED → DROP → FINAL_DROP

**MISSING (from client meeting)**:

**A) Star/Special influencer in approvals**
- "SPECIAL" feedback status should be separated from the approval flow
- Instead: add `isStarred` boolean on `Influencer` model
- CEO can star an influencer directly from the approval review
- Starred influencers are filterable across the platform

**B) Simplified counter-offer**
- Client wants counter-offer notes and rate in one field, not separate
- Merge `counterRate` and `counterNotes` into a single feedback area
- CEO writes: "$800 - too expensive, negotiate down" in one text area

**C) Notifications scoped to PIC**
- Only the PIC who submitted the approval should get the notification when CEO responds
- Not all users should see all approval alerts

---

## PHASE 5: Onboarding & Contract Management

### 5.1 Contract Creation & Signing

**What it does**: Upload PDF contract, place signature fields, send to influencer for e-signing.

**Current status**: IMPLEMENTED

**What works**:
- Upload PDF contract
- Drag-drop field placement (signature, name, date, stamp)
- Generate magic link (token-gated)
- Send link via email
- Influencer signs in browser (canvas signature pad)
- Signed PDF stored in GCS
- Contract status: DRAFT → SENT → SIGNED → ACTIVE → COMPLETED

**MISSING (from client meeting)**:

**A) Admin/company countersigning**
- After influencer signs, admin should be able to add MIXSOON's signature/stamp
- New flow: DRAFT → SENT → INFLUENCER_SIGNED → COMPANY_SIGNED → ACTIVE → COMPLETED
- Admin sees "Sign" button on contracts that have influencer signature but no company signature
- Company signature/stamp is configurable in settings

**B) Contract comment/feedback before signing**
- Influencer can choose NOT to sign and instead leave comments
- Comments field below the contract on the signing page
- If influencer submits comments (without signing), contract status = DRAFT (not SIGNED)
- PIC gets notification: "Influencer left feedback on contract"
- PIC can view comments, revise contract, re-upload, re-send
- Client said: "The agency stated change certain parts. So we need to go back and forth regarding the contract terms"

**C) Comment display in CRM**
- Contract comments visible in the influencer's Documents tab
- Show: who commented, when, what they said
- History of contract revisions

### 5.2 Onboarding Portal

**What it does**: Influencer fills in bank details and shipping address via magic link.

**Current status**: IMPLEMENTED

**What works**:
- Token-gated form (expires after set time)
- Bank details (name, account number, holder — encrypted)
- Shipping address (name, address, city, postal code, country)
- Auto-save progress

---

## PHASE 6: Content Submission & Verification

### 6.1 Content Submission Form

**What it does**: After contract signed and video posted, influencer submits video links and optional payment details.

**Current status**: IMPLEMENTED

**What works**:
- Send form link to influencer via email
- Influencer submits TikTok/Instagram video links (add multiple)
- Optional payment form (bank details)
- Content status: PENDING → SUBMITTED → VERIFIED → COMPLETED
- PIC verifies submitted links

**MISSING (from client meeting)**:

**A) Spark Code (S-code) field**
- New field on content submission form: "Spark Code" / "S-code"
- Toggle: optional or compulsory (set by PIC when sending the form)
- If compulsory, influencer cannot submit without entering the code
- Spark code is ~15 characters, used for running TikTok Spark Ads
- Store in `ContentSubmission.sparkCode` AND copy to `Influencer.sparkCode`

**B) Campaign association**
- Content submission must be linked to a specific campaign
- When PIC sends the form, they select which campaign it's for
- Campaign name visible on the submission form and in the submissions list
- Filter submissions by campaign in the Documents/Contracts tab

**C) Submission labeling/numbering**
- Each submission should have a manual label (e.g., "1st submission", "2nd submission", "Renewal #1")
- NOT auto-numbered — PIC sets the label when sending the form
- Reason: influencer may renew contract, and "1st video" of renewal is not "3rd video" overall
- Display label in submission list and on the form

**D) Multiple submissions per influencer per campaign**
- PIC can send multiple content submission forms over time
- Each submission is separate with its own label and links
- All submissions visible in influencer's Documents tab, filterable by campaign

**E) Delivery details email template**
- In addition to "content submission" and "payment" forms, need "delivery details" form
- Collects: shipping address for product delivery
- Can be sent separately or combined with content submission
- Client said: "We also need actually his information about delivery because we need to send them products"

---

## CRITICAL FIXES NEEDED

### Fix 1: Import → AI Filter → CRM Pipeline Sync

**Problem**: The flow from uploading a CSV → running AI filter → seeing approved influencers in the CRM is broken. The UI between the import/filter phase and the pipeline phase is disconnected.

**Expected flow**:
1. Upload CSV → Scrape data → See import with influencer list
2. Run AI filter on import → Score all influencers → See results in buckets
3. User reviews buckets: approves some, rejects some, trashes some
4. User clicks "Save to Pipeline" → Approved influencers appear in Influencers tab as PROSPECT
5. OKish influencers also saved but tagged as "okish" for secondary review
6. Trashed/rejected influencers stay in trash (not visible in main Influencers tab)

**What's broken**:
- Influencers from import don't properly flow into the main CRM pipeline
- AI filter results are disconnected from the influencer list page
- No clear "save approved to pipeline" action
- Filter tabs on Influencers page don't reflect AI scoring buckets

### Fix 2: Email Reply Sync

**Problem**: Replies sent from Gmail don't appear in the platform's conversation thread.

**What to check**:
- IMAP sync may not be polling frequently enough
- Thread matching (Message-ID / In-Reply-To) may fail for some email clients
- Need to verify IMAP IDLE or periodic polling is working

### Fix 3: Notification Scoping

**Problem**: All users see all notifications/alerts regardless of role or assignment.

**Fix**: Notifications should be scoped to:
- Admin: sees everything
- PIC: only sees notifications for influencers assigned to them
- Viewer: read-only access to notifications

---

## DATABASE CHANGES SUMMARY

### New fields on existing models:

**Influencer**:
```prisma
language          String?   // Detected from video captions
countryOfResidence String?  // Manually set, actual residence
audienceCountries Json?     // [{"country":"US","pct":20}]
audienceLanguage  String?   // Primary audience language
lastPostedAt      DateTime? // Date of most recent video
isStarred         Boolean   @default(false) // CEO favorite
picUserId         String?   // Assigned PIC user ID
picUser           User?     @relation("AssignedInfluencers", fields: [picUserId], references: [id])
sparkCode         String?   // TikTok Spark Ads code
```

**ContentSubmission**:
```prisma
sparkCode         String?   // Spark Ads code from influencer
campaignId        String?   // Already exists, ensure it's used
label             String?   // Manual label: "1st submission", etc.
isSparkCodeRequired Boolean @default(false) // Whether spark code is mandatory
```

**Contract**:
```prisma
companySignatureUrl  String?   // Company/admin signature
companySignedAt      DateTime? // When company signed
comments             Json?     // [{by, text, date}] from influencer
```

### New models:

**CampaignPic** (PIC assignment to campaigns):
```prisma
model CampaignPic {
  id         String   @id @default(cuid())
  campaignId String
  campaign   MarketingCampaign @relation(...)
  userId     String
  user       User @relation(...)
  assignedAt DateTime @default(now())
  @@unique([campaignId, userId])
}
```

**EmailAlertStep** (multi-layer follow-up):
```prisma
model EmailAlertStep {
  id            String @id @default(cuid())
  alertId       String
  alert         EmailAlert @relation(...)
  stepNumber    Int        // 1, 2, 3...
  delayDays     Int        // Days after previous step
  templateId    String?
  template      EmailTemplate? @relation(...)
  status        EmailAlertStatus @default(WAITING)
  triggerAt     DateTime?
  triggeredAt   DateTime?
  @@unique([alertId, stepNumber])
}
```

---

## SETTINGS & CONFIGURATION ADDITIONS

| Setting | Location | Description |
|---------|----------|-------------|
| Email sync period | `/email/settings` | How far back to sync emails (2 weeks → 6 months) |
| Trash auto-empty | `/admin/settings` (new) | Auto-delete trash after X days (0 = manual only) |
| Default AI prompt | `/email/settings` or `/admin/settings` | System prompt for AI-generated email drafts |
| Company signature | `/admin/settings` (new) | Upload company stamp/signature for contract countersigning |
| Spark code default | Campaign settings | Whether spark code is required by default for content submissions |

---

## PRIORITY ORDER FOR IMPLEMENTATION

### P0 — Critical (Fix broken flows)
1. Fix import → AI filter → CRM pipeline sync
2. Fix email reply sync bug
3. Add `lastPostedAt` field (derived from most recent video date)
4. Add `language` field (detect from captions during AI scoring)
5. Add `isStarred` boolean on Influencer
6. Add `countryOfResidence` on Influencer (manual editable field)

### P1 — High (Core client requests)
7. Trash system for AI filter (replace unscored concept)
8. Thumbnail display in AI filter queue
9. PIC assignment (on Influencer + Campaign)
10. Multi-layer follow-up alerts
11. Spark code field on content submission
12. Submission labeling
13. Campaign association on content submissions
14. Notification scoping (PIC-only notifications)
15. Bulk assign influencers to campaigns with filters

### P2 — Medium (Enhancement requests)
16. Admin/company countersigning on contracts
17. Contract comment/feedback flow
18. Configurable email sync period
19. Audience countries/language fields (manual entry)
20. Biolink extraction improvements
21. Configurable trash auto-empty period
22. AI system prompt customization for email drafts

### P3 — Future (Discussed but deferred)
23. Detailed team access control per section (client will provide list)
24. Exolyt integration for audience data
25. Auto-detect country from video metadata
26. Campaign performance tracking (Phase 7+)
