# Contributing

## Development setup

1. Install Node.js 20+ and pnpm 9+
2. Install dependencies:

```bash
pnpm install
```

3. Copy API environment file:

```bash
cp apps/api/.env.example .env
```

## Local development

```bash
pnpm dev
```

## Quality checks

Run these before opening a PR:

```bash
pnpm lint
pnpm format:check
pnpm test
pnpm -r build
```

## Pull request guidelines

- Keep PRs focused and small enough to review safely.
- Add tests for behavior changes.
- Update docs and examples when API/behavior changes.
- Use clear commit messages and include context in PR description.
