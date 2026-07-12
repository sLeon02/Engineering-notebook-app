# Engineering Notebook

A Next.js app for turning student field notes + progress photos into dated
engineering notebook entries, using Supabase (database + photo storage) and
OpenAI (drafting).

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → New project. Wait for it to finish provisioning.
2. **SQL Editor** → New query → paste the contents of `supabase/schema.sql` → Run.
   This creates the `entries` and `photos` tables with permissive row-level-security
   policies (there's no login screen in this app — it's one shared classroom notebook).
3. **Storage** → New bucket → name it exactly `notebook-photos` → toggle **Public bucket** ON.
4. Still in that bucket, go to **Policies** → New policy → choose the "Allow all" templates
   for `SELECT` and `INSERT` (again, fine here since the app has no auth — see note below
   if you want to lock it down later).
5. **Project Settings → API** → copy the **Project URL** and **anon public key**. You'll need these next.

## 2. Get a Gemini API key

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with a
   Google account.
2. Click **Create API key**. No payment method needed — Gemini's free tier covers this app's
   usage comfortably for a classroom (a generous number of requests per day, no card required).
3. Copy the key — you'll paste it into `.env.local` / Vercel as `GEMINI_API_KEY` next.

## 3. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in the three values:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GEMINI_API_KEY=...
```

## 4. Run it locally (optional but recommended before deploying)

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`.

## 5. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. [vercel.com](https://vercel.com) → Add New Project → import that repo.
3. In the Vercel project's **Settings → Environment Variables**, add the same three
   variables from step 3 above (all three, including `GEMINI_API_KEY` — it stays
   server-side and is never sent to the browser).
4. Deploy. Vercel will build and give you a live URL.

## How it works

- **Entries & photo metadata** live in Supabase Postgres (`entries`, `photos` tables).
- **Photo files** are uploaded straight from the browser to Supabase Storage. When you click
  "Generate," the server route fetches each photo from its Supabase URL, converts it to the
  format Gemini expects, and sends it along with your notes.
- **Generation** happens in `app/api/generate/route.js`, a server-only API route, so the
  Gemini key never reaches student browsers.
- **Print / Export Notebook** uses the browser's print dialog with print-specific CSS —
  students can "Save as PDF" straight from there.

## Locking it down further (optional)

Right now anyone with the URL can create/edit/delete entries — there's no login. For a
single classroom project that's usually fine, but if you want real accounts:

- Turn on **Supabase Auth** (email or Google sign-in), then change the RLS policies in
  `supabase/schema.sql` from `using (true)` to check `auth.uid()` against an `owner_id`
  column you add to `entries`.
- Wrap `app/page.js` with a simple auth check using `supabase.auth.getSession()`.

Happy to build that out too if you want student-level accounts down the line.
