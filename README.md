# RoastMyCV

RoastMyCV is a Next.js app that lets people upload a PDF resume, get a brutally funny but helpful AI roast for free, and pay $2.99 with Stripe Checkout to unlock a polished rewrite.

## Stack

- Next.js 16 App Router
- Tailwind CSS 4
- Groq Chat Completions API
- Stripe Checkout
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
- `NEXT_PUBLIC_APP_URL`

## Product flow

1. User uploads a PDF resume.
2. `/api/roast` sends extracted resume text to Groq for a structured roast and returns a normalized snapshot of the resume.
3. `/api/checkout` creates a Stripe Checkout Session for a one-time $2.99 payment.
4. After Stripe redirects back, `/api/checkout/verify` confirms the paid session.
5. `/api/rewrite` verifies the paid session matches the roasted resume snapshot, then generates the polished rewrite.

## Notes

- The paid rewrite is intentionally tied to the exact roasted snapshot from the free analysis.
- This MVP does not use a database or webhooks.
- The upload is limited to PDFs under 5MB so the app stays fast and deployment-safe.

## Verification

- `npm run lint`
- `npm run build`
