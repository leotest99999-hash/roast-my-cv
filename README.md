# RoastMyCV

RoastMyCV is a Next.js app that lets people upload a PDF resume, get a brutally funny but helpful AI roast for free, and pay $2.99 with Stripe Checkout to unlock a polished rewrite.

## Stack

- Next.js 16 App Router
- Tailwind CSS 4
- Groq Chat Completions API
- Stripe Checkout
- Vercel Blob for durable premium-session storage
- Vercel-ready deployment

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` from the example file and fill in your secrets.

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Copy `.env.example` to `.env.local` and set:

- `GROQ_API_KEY`
- `GROQ_MODEL` (optional, defaults to `llama-3.3-70b-versatile`)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `BLOB_READ_WRITE_TOKEN`
- `OWNER_PREVIEW_TOKEN` (optional, enables the hidden owner-only preview toggle at `/owner-preview`)
- `NEXT_PUBLIC_APP_URL`

## Product flow

1. User uploads a PDF resume.
2. `/api/roast` sends extracted resume text to Groq for a structured roast and returns a normalized snapshot of the resume.
3. `/api/checkout` creates a Stripe Checkout Session for a one-time $2.99 payment.
4. `/api/checkout` stores the roast snapshot server-side before redirecting to Stripe Checkout.
5. A Stripe webhook on `/api/stripe/webhook` marks successful Checkout Sessions as paid.
6. After Stripe redirects back, `/api/checkout/verify` confirms the paid session and restores any persisted premium data.
7. `/api/rewrite` verifies the paid session matches the stored roast snapshot, then generates or returns the saved premium output.

## Notes

- The paid rewrite is intentionally tied to the exact roasted snapshot from the free analysis.
- Premium unlocks now persist server-side. Local development falls back to `.data/premium-unlocks` if `BLOB_READ_WRITE_TOKEN` is not set.
- The upload is limited to PDFs under 5MB so the app stays fast and deployment-safe.
- If `OWNER_PREVIEW_TOKEN` is set, you can unlock a private owner-only preview panel at `/owner-preview` and force unpaid or paid UI states on your own browser without changing the experience for anyone else.

## Verification

- `npm run lint`
- `npm run build`
