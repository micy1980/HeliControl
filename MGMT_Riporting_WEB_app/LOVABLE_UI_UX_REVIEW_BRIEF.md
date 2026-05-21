# Lovable UI/UX Review Brief

## Purpose

This repository is a local-network financial reporting/admin web application for Hungarian business users. The current goal is not a redesign and not a new application build. The goal is a UI/UX review before the reporting module work continues.

## Product Context

- App name: MGM Reporting Codex.
- Domain: financial reporting, consolidation preparation, GL import, chart of accounts, validation, backup/restore, user/session/security administration.
- Primary users: finance/admin users who repeatedly work with dense tables, imports, validation rules, audit logs and system settings.
- UI should feel like a serious operational tool, closer to a desktop admin system than a marketing SaaS landing page.

## Current Development Focus

The current pre-report priority order is documented in `RIPORT_ELOTTI_CHECKLIST.html`:

1. Session/security settings.
2. Accounts and locked-user UX.
3. Logs filtering final audit.
4. Label system audit.
5. Language selector.
6. Light/dark theme.
7. 2FA preparation.
8. Report prerequisites.
9. Report building.

## Review Scope

Please review the UI/UX of the existing app and provide a prioritized recommendation list. Focus on practical improvements, not broad reimagination.

Review these areas especially:

- Overall admin/workspace layout.
- Window sizing and internal scrolling.
- Navigation clarity.
- Dense table readability.
- Column resizing and stable row heights.
- Checkbox, status badge, select and button alignment.
- Forms in Settings, Users, Companies, Permissions, Logs, Backup and Validation Rules.
- Visual consistency between admin modules.
- Hungarian labels, accents and copy clarity.
- Accessibility basics: contrast, focus states, target size, keyboard-friendly structure.
- Light/dark theme readiness.

## Non-Negotiable Constraints

- Do not create a landing page.
- Do not turn the app into a marketing-style SaaS homepage.
- Do not replace the desktop/admin workflow with oversized hero sections, decorative cards or promotional layouts.
- Do not remove dense operational information just to make the UI look lighter.
- Do not propose a full rewrite or framework migration as a first step.
- Do not change security/business logic.
- Do not modify code for this first pass. This first pass is audit and recommendations only.

## Desired Output

Please provide:

1. Executive summary: 5-8 bullets.
2. Top 10 UI/UX issues, prioritized by impact.
3. Concrete recommendations by screen/module.
4. Quick wins that can be implemented safely in 1-2 hours.
5. Larger improvements that should be planned separately.
6. Visual system recommendations: spacing, typography, color, table density, controls, status badges.
7. Risks or unclear areas where screenshots/runtime review would be needed.

## Tone of Recommendations

Be specific and actionable. Prefer examples like:

- "In the logs table, move filters into a single sticky filter row and preserve focus after filtering."
- "Use a consistent 30-32px row height for admin tables."

Avoid vague advice like:

- "Make it modern."
- "Add more whitespace."
- "Use cards everywhere."

## Important Notes

The repository intentionally excludes local runtime data:

- `data/`
- `*.db`
- backup files
- logs
- `.env`
- `node_modules/`

The application currently runs locally with:

```bash
npm install
npm run dev
```

Default local URL:

```text
http://127.0.0.1:3002/
```

The default development login may be visible in the login screen for local testing only.
