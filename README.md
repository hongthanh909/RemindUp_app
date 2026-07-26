# RemindUp

Personal Planner PWA dành cho một người dùng, ưu tiên riêng tư và hoạt động
offline trên iPhone.

## Chức năng hiện có

- Dashboard và đồng hồ thời gian thực
- Task, deadline, ưu tiên, checklist và phát hiện trùng lịch
- Lịch ngày/tuần và timeline
- Ghi chú có ảnh
- Pomodoro
- Tìm kiếm, Dark Mode và giao diện responsive
- IndexedDB/Dexie local-first
- Sao lưu và khôi phục JSON
- Web App Manifest và Service Worker

## Công nghệ

- React 19 + TypeScript
- Vinext/Vite
- Tailwind CSS và design tokens trong `app/globals.css`
- Dexie/IndexedDB
- Cloudflare Worker-compatible runtime

## Chạy dự án

Yêu cầu Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
npm run build
npm run deploy
```

`npm run deploy` publishes the production Worker to Cloudflare using the
authenticated Wrangler account. The first deployment receives a public
`*.workers.dev` URL; a custom domain can be connected later.

## Cấu trúc chính

```text
app/
  PlannerApp.tsx     UI và các luồng người dùng
  db.ts              Schema IndexedDB và dữ liệu mẫu
  globals.css        Design system Light/Dark
  layout.tsx         PWA metadata
public/
  manifest.webmanifest
  sw.js
worker/
  index.ts           Cloudflare-compatible entrypoint
docs/
  DECISIONS.md       Các quyết định sản phẩm đã chốt
  ACCOUNTS.md        Tài khoản và dịch vụ cần thiết
```

Quy tắc phát triển dành cho Codex và contributor nằm trong `AGENTS.md`.
