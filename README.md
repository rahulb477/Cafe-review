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
| Loyalty | `loyaltyAccounts/{uid}` (canonical, top-level; `clientId`, `customerId`, `stamps`, reward fields) | **get own only** — Staff/Admin write |
| Customer | `customers/{uid}` + `customerTokens/{token}` (opaque QR token) | create own |
| Feedback | `clients/{id}/feedback/{feedbackId}` (anonymous; `rating` is the overall rating source) | create only |
| Reviews | `clients/{id}/reviews` | create only |
| Analytics | `clients/{id}/events` | create only |

- Server resolves tenants via Firestore REST (ISR 60s); the browser keeps config + menu live with `onSnapshot`.
- Customer identity = Firebase Anonymous Auth (enable it in Firebase console → Authentication → Sign-in method).
- Customer App is **Firebase-only**: no PostgreSQL, no Drizzle, no `DATABASE_URL` (builds and deploys with zero database env vars).
  Anonymous feedback is written directly to `clients/{clientId}/feedback/{feedbackId}` by the browser SDK with a
  stable pending document ID, `rating` (or `null`), the unmodified message, and server timestamps. Feedback records
  contain no customer identity; the customer can create them but cannot read, update, or delete them. The old
  `/api/feedback` no-op endpoint is disabled so it cannot report an unsaved submission as successful. Review-flow
  writes continue to use the browser SDK; `/api/reviews` remains its existing compatibility shim. AI usage counters
  live in process memory.
- Services: `src/services/firebase/*` (single init in `firebaseClient.ts`, config + project guard in `firebaseConfig.ts`).
- Rules: `firebase/firestore.rules`, `firebase/storage.rules`, `firebase/database.rules.json`
  → merge with the Admin App's rules, then `firebase deploy --only firestore:rules,storage,database`.
- Staff App: scan the customer QR → read `ct` param → `customerTokens/{ct}.customerId` → update
  `loyaltyAccounts/{customerId}` `{ clientId, customerId, stamps, ... }`.

## Customer identity (loyalty)
- No login screen. Firebase **Anonymous Auth** creates/restores the customer UID on this device.
- First visit to **My QR** / **My Stamps** shows "Let's save your loyalty" (Name + Indian mobile, stored as `+91XXXXXXXXXX`).
- Profile: `customers/{uid}` → `{ uid, clientId, name, phone, email, totalVisits, lastVisitAt, createdAt, updatedAt, status:"active", qrToken }`.
  New: `totalVisits:0`, `lastVisitAt:null`. Existing: only name/phone/email/updatedAt change. Editable in **Settings → Your details**.
- QR contains only `?ct=<random token>`; Staff App: `customerTokens/{ct}.customerId` → `customers/{uid}` + `loyaltyAccounts/{uid}`.
- Admin: query `customers` where `clientId == <clientId>`; render with `src/shared/customerDisplay.ts`.
- Rules tested in the Firestore emulator (customers, tokens, loyalty read-only, anonymous feedback, create-only reviews/events).

> ⚠️ `NEXT_PUBLIC_FIREBASE_API_KEY` must be the exact Web App API key from Firebase → Project settings → Your apps.
> The key currently in the code is rejected by Google (`API_KEY_INVALID`), so Anonymous Auth, profiles, live
> loyalty and Firestore feedback writes are blocked until it is replaced. Also enable **Anonymous** in
> Authentication → Sign-in method.

## Live diagnostics
Open any page with `?diag=1` (sticky for the tab; `?diag=0` to turn off), or set `NEXT_PUBLIC_DIAGNOSTICS=true`.
Error states then show the exact chain: Firebase init · Anonymous Auth (exact `auth/*` code) · UID ·
`loyaltyAccounts/{uid}` read (exact Firestore code) · `customers/{uid}` read. Console lines are prefixed `[diag]`.
No secrets are shown (API key → length + last 4 chars only).

Required production rules for the customer app: `firebase/customer-rules-patch.rules`
(paste inside `match /databases/{database}/documents { … }` of the deployed rules and publish).

## Visit tracking (Staff App) & Admin display
- A visit is counted ONLY by the Staff App after a successful stamp operation — never by the customer app.
- Use `src/shared/staffVisitService.ts` (copy/import into the Staff App):
  `await recordStaffVisit(db, { customerId, transactionId })` right after the stamp transaction commits
  (or `prepareVisit` + `commitVisit` inside the same `runTransaction`).
  It atomically sets `customers/{uid}.totalVisits += 1`, `lastVisitAt/updatedAt = serverTimestamp()`,
  `lastVisitTransactionId`, and flags `stampTransactions/{transactionId}.visitCounted = true`.
  Retries / double taps of the same `transactionId` return `{ counted:false, reason:"already-counted" }`.
- Admin Panel: `mapCustomerForDisplay(id, customerDoc, loyaltyDoc)` / `formatFirestoreDate(value)` from
  `src/shared/customerDisplay.ts` — handles Timestamp, Date, ISO, epoch and serialized timestamps; never
  renders `undefined`, `Invalid Date` or `NaN` (fallbacks: `0`, `No visits yet`, `Date unavailable`, `—`).
- Rules: publish `firebase/customer-rules-patch.rules` (replaces the previous customer patch). Until then the
  customer app automatically uses the previous profile shape so saving keeps working.

## Phone uniqueness — ONE phone + ONE business = ONE customer
- Canonical normalizer: `src/shared/phone.ts` (`normalizeIndianPhone` → `+91XXXXXXXXXX`), used everywhere incl. the migration script.
- Index: `customerPhoneIndex/{clientId}_{digits}` → `{ phone, clientId, customerId, createdAt, updatedAt }`
  (the clientId prefix makes uniqueness per business).
- `customers/{uid}`, its index entry and QR token are written in ONE transaction; rules make index entries
  create-only and require the customer doc to own its entry, so duplicates are impossible across refreshes,
  tabs, new anonymous UIDs, retries and simultaneous submissions. A taken number returns
  `PHONE_ALREADY_REGISTERED` → "This number is already registered." (no data of the other customer is read).
- Phone change: claim new entry + release old entry + update doc atomically.
- Not listable; customers can read only their own entry. Until `firebase/customer-rules-patch.rules` (v3) is
  published, NEW registrations are refused (`RULES_OUTDATED`) rather than created without the guarantee.
- Existing duplicates: `node scripts/dedupe-customers.mjs` (dry run) → `--apply` (merge + soft-mark) →
  `--apply --delete` (delete only after verification; archive kept in `customerMergeArchive`). Needs Admin credentials.
- Admin lists: `dedupeCustomers(rows)` + `mapCustomerForDisplay()` from `src/shared/customerDisplay.ts`.

### Phone index v4 (regex-free) — current
- `customers/{uid}.phoneIndexId` = `${clientId}_${digits}` = id of `customerPhoneIndex/{phoneIndexId}`
  (`{ phone, clientId, customerId, createdAt, updatedAt }`). Rules verify `clientId + '_' + normalizedPhone[1:]` — no regex.
  Never use `replace('+', '')` in rules: `+` is an invalid regex and denies every request.
- Publish `firebase/customer-rules-patch.rules` **v4** (replaces v3). Health id: `customerPhoneIndex/_rules_probe_v4`.
  If the deployed rules don't match, registration returns `RULES_NOT_DEPLOYED` (logged `[diag]`, nothing written,
  never shown as "already registered").
- Protect pre-existing numbers (e.g. Goku) without merging: `node scripts/dedupe-customers.mjs --index-only` → `--index-only --apply`.

### Final rules (single file)
Publish **only** `firebase/firestore.rules` (complete file; the old `customer-rules-patch.rules` is removed).
`customerTokens/{token}` now stores `{ customerId, clientId, createdAt }`; staff can resolve only their business's tokens.
Unauthenticated `clients` queries must filter `status == "PUBLISHED"` (the server does). No rules probe.
Deploy the Customer App build and publish the rules together.
