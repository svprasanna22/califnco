# Califnco AI Instagram Product Posting — Phase 1 Integration Plan

## 1. System Objective
Automatically generate and publish **one promotional Califnco water purifier product post to Instagram every day without manual intervention**, featuring:
1. Real product selection from the Firestore catalog.
2. AI-generated promotional visual (preserves brand identity, no fabricated claims).
3. AI-generated marketing caption tailored for Indian households with relevant hashtags.
4. Public image hosting on a high-availability HTTPS endpoint.
5. Official Instagram Graph API publication (two-step container flow).
6. Persistent execution history in Firestore (`instagram_posts`).
7. 24/7 autonomous scheduling independent of the administrator's local machine or browser.
8. Califnco Admin Portal monitoring dashboard with manual test and retry capabilities.

---

## 2. Provider Evaluation & Zero-Cost Tier Analysis

| Component | Selected Provider | Fallback Provider | Free-Tier Limits & Cost | Eligibility / Constraints |
| :--- | :--- | :--- | :--- | :--- |
| **Language Model** | Google Gemini 1.5 Flash | Groq API (Llama 3.3 70B) | **100% Free** (15 RPM / 1,500 RPD on Gemini; 30 RPM / 14,400 RPD on Groq). Cost: $0.00. | Requires API key; no credit card required on free tier. |
| **Image Generation** | Hugging Face Inference API (`FLUX.1-schnell` / `SDXL`) | Pollinations AI Image Service | **100% Free** (HF Inference free tier; Pollinations is unlimited zero-token public service). Cost: $0.00. | Zero-cost guarantee. Generates 1080x1080 commercial visual. |
| **Image Hosting** | Cloudinary API | ImgBB API / Direct Public URL | **100% Free** (25 credits/month on Cloudinary; unlimited 32MB uploads on ImgBB). Cost: $0.00. | HTTPS URL accessible by Meta crawlers without authentication. |
| **Instagram API** | Official Instagram Graph API (v21.0) | Safe Config / Dry-Run Mode | **100% Free** (Standard Meta Graph API rate limit: 200 calls/hour). Cost: $0.00. | Requires Instagram Business/Creator Account linked to a Facebook Page and User/Page Access Token. |
| **Scheduling** | GitHub Actions Cron + Render Backend Cron | n8n Workflow Blueprint | **100% Free** (2,000 free runner minutes/month on GitHub Actions; ~15 mins needed/month). | Continues executing 24/7 when browser/computer is powered off. |

---

## 3. Workflow Architecture

```
[Schedule Trigger: 10:00 AM IST Daily]
   │ (GitHub Actions Cron / Render Cron / Admin Manual Trigger)
   ▼
[Step 1: Check Idempotency]
   │ Query Firestore for existing post on today's dateKey (YYYY-MM-DD)
   │ If already published today -> Exit early (Prevent duplicates)
   ▼
[Step 2: Deterministic Product Selection]
   │ Read active catalog from Firestore 'products'
   │ Filter out demo/invalid items; select next product via round-robin pointer
   ▼
[Step 3: AI Caption & Hashtag Generation]
   │ Gemini 1.5 Flash (fallback Groq) prompts on real features & specs only
   │ Enforce Indian market tone, verified benefits, and targeted hashtags
   ▼
[Step 4: AI Promotional Image Generation]
   │ FLUX.1-schnell / Pollinations generates 1080x1080 luxury kitchen visual
   │ Verifies image bytes are non-empty and valid image format
   ▼
[Step 5: Public Image Hosting]
   │ Upload to Cloudinary / ImgBB; obtain stable HTTPS URL
   │ Verify URL responds with HTTP 200 before calling Meta
   ▼
[Step 6: Instagram Graph API Publication]
   │ 1. POST /{ig-user-id}/media (create container with image_url + caption)
   │ 2. POST /{ig-user-id}/media_publish (publish container)
   │ 3. GET /{media-id} (retrieve permalink and timestamp)
   ▼
[Step 7: Persist Execution Record]
   │ Save run document to Firestore collection 'instagram_posts'
   │ Update round-robin pointer in 'automation_state'
   │ Stream real-time updates to Califnco Admin Portal
```

---

## 4. Execution Phases

- **Phase 1: Architecture Audit & Plan** *(Completed)*
- **Phase 2: AI Caption and Image Generation Engines** (server-side adapters in `backend/src/services/` with comprehensive validation).
- **Phase 3: Catalog Selection, Idempotency, and Persistent Logging** (Firestore state and dateKey checks).
- **Phase 4: Instagram Graph API Integration** (container creation, publishing, permalink retrieval, and graceful credential handling).
- **Phase 5: Califnco Admin Integration** (`AutomationView.tsx` with live telemetry, manual trigger, retry, and credential status).
- **Phase 6: Multi-layer Scheduling & Validation** (GitHub Actions workflow, n8n workflow export, test suite, and compilation checks).
