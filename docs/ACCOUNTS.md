# Accounts and external services

## Required now

No external account is required for local development or local-first data.

## Recommended

### GitHub

Create one private repository named `RemindUp_app`.

Use it for source history, issues, pull requests, and disaster recovery of the
codebase. Do not commit `.env` files, VAPID private keys, recovery phrases, or
production data.

### Hosting and backend

The current private preview is hosted with OpenAI Sites. A separate Cloudflare
account is only required if the project later moves to independently managed
Workers, D1, R2, Cron Triggers, or a custom domain outside Sites.

## Required for the full cloud roadmap

- A production domain or stable HTTPS origin for Web Push.
- A secure place for VAPID private keys and production environment variables.
- D1 or another relational database for sync metadata.
- R2 or equivalent object storage for encrypted image/backup blobs.

## Optional

- Figma account for a shared design source and component library.
- Sentry account for privacy-filtered error monitoring.
- Apple Developer account is not required for a Home Screen PWA or standards-
  based Web Push.
