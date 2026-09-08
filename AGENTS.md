# Working in this repository

## Architecture in one paragraph

TanStack Start (React 19) on a plain Node server, backed by PostgreSQL through
`src/lib/db/client.server.ts`. Only the server holds database credentials, so
access control lives in application code rather than in database policies.

## Access model — the rule that shapes everything

- `/` is **public and anonymous**. Anyone can talk to the avatar with no account.
- `/auth` and `/admin` are for administrators only.
- There is no public signup, no ordinary-user login, and no password reset.
  Accounts exist solely via `npm run db:seed-admin`.

Consequences to respect when adding code:

- Every new administrative endpoint must sit behind `requireAdminSession`
  (`src/lib/ravi/admin.middleware.ts`). Nothing else grants admin capability.
- Every new **public** endpoint must enforce a rate limit before doing anything
  that costs money, and must resolve the caller through
  `getOrCreateVisitorId()`. If it touches a conversation, it must first call
  `assertOwnSession()` — a caller-supplied session id proves nothing on its own.
- Never accept conversation history, provider names, or model ids from a public
  caller. History is rebuilt server-side in `pipeline.server.ts`.

## Providers

OpenAI is the mandatory baseline (answers, embeddings, transcription, fallback
voice). OpenRouter, Groq, Deepgram and ElevenLabs are optional and swap in per
capability. One key covers both HeyGen and LiveAvatar; the vendor is detected
from the key itself, so do not add a vendor switch.

## Vector search

`knowledge_chunks.embedding` has two possible column types depending on whether
the database allowed `CREATE EXTENSION vector`. Always go through
`src/lib/ravi/vector.server.ts` rather than writing embedding SQL directly.

## Before pushing

```bash
npm run typecheck
npm run build
npm run test:e2e     # needs a running server and a migrated database
```

`vite.config.ts` carries the Nitro `node-server` preset and `0.0.0.0` binding
that make deployment work. It also has three long-standing type errors that
predate this codebase's current shape; leave the file alone unless the
deployment itself needs changing.
