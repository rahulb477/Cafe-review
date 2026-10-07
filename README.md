# White-label QR Customer Experience Platform

One codebase → unlimited branded café/restaurant apps at `/<clientSlug>`
(e.g. `/bake`, `/sharma-cafe`, `/royal-restaurant`). Table/location QR params:
`/bake?table=1`, `/bake?location=counter`.

## Add a new client (no UI changes)
1. Put assets in `public/clients/<slug>/` (logo.svg, cover.jpg, menu images — all optional; fallbacks exist).
2. Append a `ClientConfig` object to `src/config/clients.ts` (types in `src/types/client.ts`).
   Use `/admin` → "New client template" to draft & validate the JSON with a live theme preview.
3. Optional server secrets: `WIFI_PASSWORD_<SLUG_UPPER_SNAKE>`.
4. Deploy. `/<slug>` now renders the fully branded app; generate table QRs in `/admin`.

## Architecture
- `src/config/clients.ts` – client registry (V1 local data source)
- `src/services/clientService.ts` – the only accessor for client configs (swap for Supabase/Firebase/REST)
- `src/services/*` – menu, loyalty, feedback, social, wifi, qr, review, aiReview (all client-scoped)
- `src/server/ai/*` – `MockAIProvider` / `RealAIProvider` (OpenAI-compatible) + per-client monthly usage counters (in-memory, no database)
- `src/store/clientStore.ts` – per-client session, persisted under `qrapp:{slug}:{key}`
- `src/lib/theme.ts` + `globals.css` – client theme → CSS variables → Tailwind tokens (`primary`, `accent`, `canvas`, …)
- `src/config/platform.ts` – `AI_MONTHLY_PRICE`, default client, reserved slugs, app URL, admin gate

## Environment
See `.env.example`. **No database env vars are required** — there is no `DATABASE_URL`, PostgreSQL or Drizzle
in this app, and `npm run build` succeeds without any of them. Firebase public config uses `NEXT_PUBLIC_FIREBASE_*`.
AI keys are server-only; without `AI_API_KEY` the mock provider is used.
`/admin` is available outside production, or in production with `ADMIN_ENABLED=true`.

## Firebase backend (project `cafe-review7`)
| Data | Location | Customer access |
|---|---|---|
| Tenant config | `clients/{clientId}` (resolved by `slug`, status `PUBLISHED`) | read |
| Menu | `clients/{id}/menuCategories`, `clients/{id}/menuItems` (`active`, `sortOrder`) | read (live) |
| Loyalty | `loyaltyAccounts/{customerId}` (top-level; deployed Staff fields include `clientId`, `customerId`, `stamps`, `stampTarget`, `isEligibleForReward`, `lastStampAt`, and `totalRewardsRedeemed`) | **get own only** — assigned Staff/Admin read; Staff is transaction authority |
| Customer | `customers/{uid}` + `customerTokens/{token}` (opaque QR token) | create own |
| Feedback | `clients/{id}/feedback` (anonymous) | create only |
| Reviews | `clients/{id}/reviews` | create only |
| Analytics | `clients/{id}/events` | create only |

Customer/Admin mappers accept both `stamps` and `currentStamps`. The deployed Staff writer does not yet write `lifetimeStamps` or `rewardsEarned`; lifetime stamps and earned rewards are derived from valid, counted stamp history until the Staff schema is upgraded.

- Server resolves tenants via Firestore REST (ISR 60s); the browser keeps config + menu live with `onSnapshot`.
- Customer identity = Firebase Anonymous Auth (enable it in Firebase console → Authentication → Sign-in method).
- Customer App is **Firebase-only**: no PostgreSQL, no Drizzle, no `DATABASE_URL` (builds and deploys with zero database env vars).
  Feedback/reviews are written to Firestore by the browser SDK; `/api/feedback` and `/api/reviews` are Firebase-only
  compatibility shims for bundled demo tenants (they never touch a database). AI usage counters live in process memory.
- Services: `src/services/firebase/*` (single init in `firebaseClient.ts`, config + project guard in `firebaseConfig.ts`).
- Rules: `firebase/firestore.rules`, `firebase/storage.rules`, `firebase/database.rules.json`.
  The checked-in Rules bind **every Admin, including a Super Admin-marked account,** to
  `admins/{uid}.clientId`; Staff access is bound to `staffUsers/{uid}.clientId`. Normal Admins can inspect
  loyalty/stamp history but cannot create Staff stamp transactions or write loyalty balances.
- Staff App: scan the customer QR → read `ct` param → `customerTokens/{ct}.customerId`. Its current flow first
  creates an idempotent, uncounted reservation at `clients/{clientId}/stampTransactions/{transactionId}`, then
  atomically marks that row counted while updating the customer visit and `loyaltyAccounts/{customerId}.stamps`.
  Checked-in Rules use stored `lastStampAt` plus Firebase `request.time` to enforce the 12-hour interval; the
  separate Staff UI/service still needs an explicit cooldown countdown and a `lifetimeStamps` write before the
  full cross-app acceptance criteria are met.

## Customer identity (loyalty)
- No login screen. Firebase **Anonymous Auth** creates/restores the customer UID on this device.
- First visit to **My QR** / **My Stamps** shows "Let's save your loyalty" (Name + Indian mobile, stored as `+91XXXXXXXXXX`).
- Profile: `customers/{uid}` → `{ uid, clientId, name, phone, email, totalVisits, lastVisitAt, createdAt, updatedAt, status:"active", qrToken }`.
  New: `totalVisits:0`, `lastVisitAt:null`. Existing: only name/phone/email/updatedAt change. Editable in **Settings → Your details**.
- QR contains only `?ct=<random token>`; Staff App: `customerTokens/{ct}.customerId` → `customers/{uid}` + `loyaltyAccounts/{uid}`.
- Admin data reads use `src/services/firebase/adminDataService.ts`, which resolves the signed-in Admin's assigned `clientId` from `admins/{uid}` and fetches only canonical Firebase collections. A Super Admin role marker does not widen either the service or Firestore Rules scope.
- Customer display and timestamps use `src/shared/customerDisplay.ts` and `src/shared/firestoreTimestamp.ts`. Customer-facing IDs use `customerCode`/`code`/`customerNumber`; Firebase UIDs are not used as display IDs.
- Rules changes must be exercised against the Firestore Emulator with the production Admin/Staff/customer fixtures before deployment.

> ⚠️ `NEXT_PUBLIC_FIREBASE_API_KEY` must be the exact Web App API key from Firebase → Project settings → Your apps.
> The key currently in the code is rejected by Google (`API_KEY_INVALID`), so Anonymous Auth, profiles, live
> loyalty and Firestore feedback writes are blocked until it is replaced. Also enable **Anonymous** in
> Authentication → Sign-in method.

## Live diagnostics
Open any page with `?diag=1` (sticky for the tab; `?diag=0` to turn off), or set `NEXT_PUBLIC_DIAGNOSTICS=true`.
Error states then show the exact chain: Firebase init · Anonymous Auth (exact `auth/*` code) · UID ·
`loyaltyAccounts/{uid}` read (exact Firestore code) · `customers/{uid}` read. Console lines are prefixed `[diag]`.
No secrets are shown (API key → length + last 4 chars only).

## Visit tracking (Staff App) & Admin display
- A visit is counted ONLY by the Staff App after a successful stamp operation — never by the customer app.
- Use `src/shared/staffVisitService.ts` (copy/import into the Staff App):
  `await recordStaffVisit(db, { customerId, transactionId })` right after the stamp transaction commits
  (or `prepareVisit` + `commitVisit` inside the same `runTransaction`).
  It atomically sets `customers/{uid}.totalVisits += 1`, `lastVisitAt/updatedAt = serverTimestamp()`,
  `lastVisitTransactionId`, and flags `stampTransactions/{transactionId}.visitCounted = true`.
  Retries / double taps of the same `transactionId` return `{ counted:false, reason:"already-counted" }`.
- Admin Panel shared mapping: `mapCustomerForDisplay(id, customerDoc, loyaltyDoc)` and the centralized
  `formatFirestoreTimestamp(value)` always produce safe display values (`—` for missing or malformed fields).
  `currentStamps`, `lifetimeStamps`, rewards, visits, last-stamp time, and the 12-hour cooldown are kept separate.
- Admin data is read from Firebase on demand through `loadAdminPanelData()`; `buildAdminPanelViewModel()`
  normalizes review/feedback/customer/activity records without generating demo entries.
- The Firestore rule file scopes Admin reads/writes to `admins/{uid}.clientId`, regardless of role marker; deploy only after
  emulator testing and confirming each production Admin document has its assigned `clientId`.

## Phone uniqueness — ONE phone + ONE business = ONE customer
- Canonical normalizer: `src/shared/phone.ts` (`normalizeIndianPhone` → `+91XXXXXXXXXX`), used everywhere incl. the migration script.
- Index: `customerPhoneIndex/{clientId}_{digits}` → `{ phone, clientId, customerId, createdAt, updatedAt }`
  (the clientId prefix makes uniqueness per business).
- `customers/{uid}`, its index entry and QR token are written in ONE transaction; rules make index entries
  create-only and require the customer doc to own its entry, so duplicates are impossible across refreshes,
  tabs, new anonymous UIDs, retries and simultaneous submissions. A taken number returns
  `PHONE_ALREADY_REGISTERED` → "This number is already registered." (no data of the other customer is read).
- Phone change: claim new entry + release old entry + update doc atomically.
- Index entries are not listable; customers can read only their own entry. Registration and phone changes rely on
  atomic writes governed by the complete `firebase/firestore.rules` file; there is no separate customer-rules patch.
  Emulator-test the full rules file before deployment.
- Existing duplicates: run `node scripts/dedupe-customers.mjs --dry-run` first. Candidates are matched only by
  `clientId + normalizedPhone` (never by name alone); the report includes customer code, UID, createdAt, loyalty,
  stamp/reward history, QR tokens, and phone-index ownership. Index-only backfills are available with
  `--index-only --apply`. A merge requires an explicit reviewed `--merge-group <phoneIndexId> --apply`; it archives
  duplicate profiles, preserves counters and history, and does not delete records. Orphan QR-token candidates are
  reported only and never deleted by this tool.
- Lifetime counters: `node scripts/reconcile-loyalty.mjs --dry-run [--client <clientId>]` compares current balances
  with valid `clients/{clientId}/stampTransactions` history. Only run `--apply` after reviewing the report; the
  migration is upward-only, does not create missing accounts, and does not alter current balances based on history.
- Admin lists: `dedupeCustomers(rows)` + `mapCustomerForDisplay()` from `src/shared/customerDisplay.ts`.

### Phone index (per-business uniqueness)
- `customers/{uid}.phoneIndexId` is `${clientId}_${normalizedPhone digits}` and points to
  `customerPhoneIndex/{phoneIndexId}` (`{ phone, clientId, customerId, createdAt, updatedAt }`).
- Registration continues to write the customer, phone index, and QR token atomically. Rules preserve one phone
  per business and do not allow Admin data reads to weaken that constraint.
- Use the dry-run/index-only migration options above to identify or backfill missing valid phone indexes. The
  dedupe script does not delete customer data, transaction records, reward history, or QR tokens.

### Firestore rules deployment
`firebase/firestore.rules` is the complete rules file for the Customer/Admin checkout. It keeps published-client reads and customer-owned profile/token operations, scopes **all** Admin access (including Super Admin-marked accounts) to `admins/{uid}.clientId`, and scopes Staff access to `staffUsers/{uid}.clientId`. Admins have read-only stamp/reward transaction visibility; Staff remains the stamp transaction authority. This file has not been compiled or exercised in the Firestore Emulator, and the Staff repository has a separate `firestore.rules` file. Do not deploy either copy until they are reconciled and the complete rules are emulator-tested against the deployed Staff write schema and production identity fixtures.
