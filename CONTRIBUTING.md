# Contributing

Thanks for helping. DispatchAI is a small, self-hosted project; the goal is that the next business owner can install it and it just works.

## Ground rules

- **Small changes, one purpose each**, with a test. A bug fix comes with the test that failed before it.
- **The confirmation gate is not negotiable.** Nothing is booked, moved or cancelled unless the caller's last message was a clear yes to that exact offer. The AI may read intent; it must never confirm.
- **Never leak customer data.** Do not read a name, address or booking to a caller who has not verified. Keep replies for unknown and wrong details identical.
- **Never print or commit secrets.** No `.env`, keys or real customer data in issues, tests or fixtures. Demo data must be fictional.
- Prefer the smallest change that fully solves the problem. No new dependency for a few lines.

## Set up

```bash
npm install
npm test && npm run typecheck
```

See the README for running the server, the dashboard, the Playwright test (`npm run e2e`) and the Docker smoke test.

## Pull requests

- Branch from `main`, keep the PR to one topic.
- Run `npm test`, `npm run typecheck` and a web build. If you changed the onboarding or booking flow, run `npm run e2e`.
- Describe what changed, why, and what you did **not** verify (for example, a provider you had no account for).
- A new plugin needs: field validation, a **Test** that explains failures in plain words, and fixture tests that need no live account.
