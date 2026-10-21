# Tarizz Web

Tarizz Web is the browser companion for the Tarizz desktop project manager. It provides authenticated projects, nested notes, a rich editor, private attachments, daily planning, and manual `.tarizz` import/export.

## Stack

- Next.js App Router and TypeScript
- Tiptap/ProseMirror editor
- Supabase Auth, PostgreSQL, Row Level Security, and private Storage
- Vercel-compatible deployment

## Local setup

1. Install dependencies: `npm install`
2. Create a Supabase project.
3. Open the Supabase SQL editor and run the migrations in order:
   - `supabase/migrations/0001_initial.sql`
   - `supabase/migrations/0002_security_limits_and_optimized_media.sql`
   - `supabase/migrations/0003_dashboard_performance.sql`
4. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key.
5. In Supabase Auth, enable email/password and Google.
6. Add `http://localhost:3000/auth/callback` to the allowed redirect URLs.
7. Start the app with `npm run dev`.

Never put the Supabase secret/service-role key in this repository or in a `NEXT_PUBLIC_` variable.

## Google login

Create OAuth credentials in Google Cloud, add the Supabase callback URL shown by the Supabase Google provider screen, and paste the Google client ID and secret into Supabase. The browser app only needs the Supabase publishable key.

## Vercel deployment

1. Push this repository to GitHub and import it into Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL` to Vercel.
3. Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS Vercel URL.
4. Add `https://YOUR_DOMAIN/auth/callback` to Supabase Auth redirect URLs and the Site URL to the Supabase URL configuration.
5. Deploy and test both email verification and Google OAuth from the production domain.

## Data model and security

The SQL migration creates `projects`, `nodes`, `documents`, `attachments`, and `calendar_tasks`. Every row has an `owner_id`, every table has Row Level Security enabled, and every policy requires `owner_id = auth.uid()`. Storage objects must begin with the signed-in user ID.

## Limits and optimization

- JPEG, PNG, and WebP sources are limited to 15 MB. Before upload the browser creates a 1280 px preview and a higher-quality 2560 px WebP download; the original is discarded.
- GIF, video, PDF, Word, and text attachments are limited to 20 MB. They are not recompressed because doing so reliably in-browser would make the editor slow or damage the file.
- Each user has a 500 MB storage ceiling, enforced by the storage policy.
- Storage uploads are limited to 60 objects per hour. An optimized image uses two objects (preview and download).
- Document saves are limited to 240 per hour. Project, note, task, and attachment creation have separate server-side limits.
- `.tarizz` imports are limited to 100 MB compressed, 200 MB expanded, 1,000 entries, 500 nodes, 20 MB per attachment, and 5 import starts per hour.

The browser validates early for better feedback, while PostgreSQL functions, triggers, bucket limits, and Storage RLS enforce the security boundaries. `.tarizz` imports also reject unsafe ZIP paths, validate checksums, and roll back project rows and uploaded files after a failed import.

This is standard secure cloud storage, not zero-knowledge encryption. Exported `.tarizz` packages contain readable project content.

## Commands

- `npm run dev` — local development
- `npm run typecheck` — strict TypeScript check
- `npm run lint` — lint
- `npm test` — unit tests
- `npm run build` — production build
