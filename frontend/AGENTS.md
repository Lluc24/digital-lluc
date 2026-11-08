# Frontend: Next.js 16 (App Router), React 19, TypeScript strict, pnpm, Tailwind 4, biome.

This is NOT the Next.js you know: read `node_modules/next/dist/docs/` before using an API. Root AGENTS.md rules apply to TypeScript too.

- Start flat in src/; `src/app/` holds only routes. Split into folders only when concrete code needs it.
- Pure modules (session.ts, blog-post.ts) stay free of React, fetch and fs.
- I/O lives in named modules: env.ts (server env, parsed with zod), session-api.ts (server → backend), session-client.ts (browser → /api/sessions), blog.ts (content/blog). Every response and file is parsed with zod.
- The look is Liquid Glass: reuse `glassClassName`/`pressableClassName` from glass.ts and the theme tokens in globals.css; no one-off colors.
- No `any`, no non-null `!`, no `as` casts except `as const`: biome rejects them. `pnpm check` (biome ci, tsc) and `pnpm build` pass before commit.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
