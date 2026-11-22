# QualityHub

A small, bilingual project-quality workspace. The frontend runs on GitHub Pages. Supabase provides sign-in, PostgreSQL data, row-level access rules, and an administrator-only user-management function.

## What it does

- Admin-created usernames and passwords. Public sign-up is disabled in the authentication service.
- Per-project viewing permissions. New viewers start with no project access.
- Project cards, progress updates and history, quality-register tables, record details, and inspection workload.
- Admin project and record editing, dated progress updates, and an activity log.
- CSV / XLSX import with validation and a preview, plus CSV export.
- English and Arabic, including right-to-left layouts. Responsive phone and desktop views.

## Data and access

The repository contains application code, not project data. Project names, registers, source attachments and passwords must never be committed here. The browser config contains only the Supabase project URL and its publishable anonymous key. That key is expected to be visible. Database grants and row-level security control access.

Viewers can only read their assigned projects. They cannot edit records or grant access. Disabling a viewer blocks data access through the database rules, including for an existing browser session. Administrator accounts can manage all projects and users.

Authentication sessions are stored in the current browser tab's session storage, not in long-lived local storage. Usernames are mapped internally to synthetic email identifiers; no mailbox is needed. Password changes are performed by the administrator. This release does not implement self-service email password recovery or app-level MFA.

## Updating project data

1. Sign in as an administrator.
2. Add or open a project.
3. Use **Post update** for a dated progress report. The latest reporting date sets the progress on the project card.
4. Open **Registers** to add or edit a record, or use **Import data**.
5. Download the standard import template. Use one project and register per file. Required columns are `reference` and `title`; dates use `YYYY-MM-DD`.
6. Review the import preview. Matching project + register + reference + revision rows are updated. Missing rows are not deleted. A failed multi-batch import can be partial; importing the same file again updates matching rows without making duplicates.
7. Open **User management** to create a viewer, then assign the projects they can see.

The import limit is 5 MB / 5,000 rows per file. CSV and the first worksheet of an XLSX workbook are supported. Original, differently shaped contractor workbooks must be mapped to the standard template first. No macro execution is supported.

## Metric definitions

Dashboard counts use records marked as current revisions and their latest stored state. Open, under-review, closed, void, superseded and other are separate states. Percent progress is the project's latest dated progress report, not a percentage inferred from register counts. Historical progress reports remain visible in **Progress history**. Inspection workload counts current-revision RFIs by recorded inspection date for the selected 30-day period; it does not reconstruct past statuses.

Imported source fields are retained as additional record fields for traceability. Original repeated references can have a source-row suffix to avoid losing distinct rows. This release does not recreate every calculation or every original workbook's parsing rules.

## Development

Requires Node.js 20 or newer. SheetJS is pinned to the maintained 0.20.3 distribution from its official CDN, rather than the older npm-registry release.

```sh
npm ci
npm run build
```

The `quality.config.json` file has `url` and `anonKey` fields. Set `QUALITY_CONFIG_FILE` to use a different public config file. Never put a service-role key or an account token in it. Built output is in `docs/`. GitHub Pages serves the `main` branch's `/docs` directory.

For a new backend, apply `backend/schema.sql`, then `backend/workload.sql` to a dedicated Supabase project. Deploy `backend/manage-users.ts` as the `manage-users` Edge Function. The handler verifies the caller's JWT with Supabase Auth and checks the caller's active administrator profile on every request. Its allowed origins should match the hosting domains. Provision the initial admin through Supabase Auth and insert its corresponding `profiles` row through a trusted server-side connection. Disable public sign-up in Supabase Auth and set a password minimum of 12 characters.

## Operations

This is an initial working release, not an independent security audit. Review your organization's data-hosting rules before wider rollout. Take regular database exports and keep them outside the repository. The free hosting/database tiers have usage limits and can have inactivity or availability restrictions. A production rollout should include an agreed backup/restore process, monitoring, and a review of data residency and account ownership.

© Abdelrahman Hamdy
