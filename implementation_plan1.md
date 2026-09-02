# VoiceTally Phase 1 — Web MVP Implementation Plan

Build the double-entry accounting engine: auth, manual voucher entry (Payment/Receipt/Contra/Journal), ledger view, running balances. No voice yet — accounting engine and balance invariant fully built and tested.

---

## User Review Required

> [!IMPORTANT]
> **Tier 1 baseline scope**: The spec says "Voice module already its own scaled service from day one." Since Phase 1 explicitly excludes voice (Phase 3), I will scaffold the Voice service directory structure and Docker container but leave it empty. The queue (BullMQ) will be fully built for **ledger posting** (Section 3a) from day one. Please confirm this interpretation.

> [!WARNING]
> **ORM choice**: The spec lists "Prisma or Sequelize." I will use **Prisma** — it has stronger TypeScript inference, better migration tooling, and its `$transaction` API maps cleanly to the atomic journal-entry write requirement. Sequelize is heavier and its TS support is weaker. If you prefer Sequelize, say so now.

> [!IMPORTANT]
> **React frontend scope for Phase 1**: The spec says "manual voucher entry, ledger view, running balances." I plan to build a fully functional web UI with: login/register, chart of accounts management, voucher entry forms (Payment/Receipt/Contra/Journal), account ledger view with running balance, and a dashboard showing account summary. Statements (P&L, Balance Sheet, Cash Flow) are Phase 2. Confirm this is the right cut.

## Open Questions

> [!IMPORTANT]
> **Currency**: The spec doesn't mention multi-currency. I'll assume single-currency (INR) for Phase 1 and store all amounts as `Decimal(15,2)`. Should I plan for multi-currency later?

> [!IMPORTANT]
> **Authentication provider**: The spec says "JWT/managed auth." I'll implement local JWT auth (email + password, bcrypt hashing, access + refresh tokens in Redis). No OAuth/SSO for Phase 1. Acceptable?

> [!NOTE]
> **Deployment target**: The spec mentions Docker + Kubernetes. For Phase 1 development, I'll create `docker-compose.yml` for local dev (Postgres + Redis + API + Worker) and Dockerfiles for each service. K8s manifests are deferred to when you have a cluster target.

---

## Proposed Changes

Two top-level folders — one backend, one frontend. The BullMQ worker runs as a **separate entry point** (`worker.ts`) inside the same backend codebase, sharing all models, config, and Prisma client directly.

```
VoiceTally/
├── backend/                # Express + BullMQ worker (modular monolith)
│   ├── src/
│   ├── prisma/
│   └── tests/
├── frontend/               # React (Vite)
│   └── src/
├── deploy/
│   ├── docker/             # Dockerfiles
│   └── postgres/           # SQL trigger scripts
├── docker-compose.yml
└── .env.example
```

---

### Project Root

#### [NEW] `docker-compose.yml`
Services: `postgres` (v16), `redis` (v7), `api` (backend server.ts), `worker` (backend worker.ts), `web` (frontend dev server). Volumes for DB persistence. Environment variables via `.env`.

#### [NEW] `.env.example`
Template for all required environment variables.

---

### `backend/` — Express Backend + BullMQ Worker

This is the core. Each module follows **Model → Controller → View** internally, with fat models owning business rules. The worker is a separate entry point (`worker.ts`) that imports the same models and queue definitions — no code duplication.

#### Directory structure:
```
backend/
├── src/
│   ├── app.ts                    # Express app setup, middleware, route mounting
│   ├── server.ts                 # HTTP server entry point (npm run dev)
│   ├── worker.ts                 # BullMQ worker entry point (npm run worker)
│   ├── core/
│   │   ├── config/               # env parsing, validated config object
│   │   ├── database/             # Prisma client singleton
│   │   ├── redis/                # Redis/ioredis client singleton
│   │   ├── queue/                # BullMQ queue definitions + job types
│   │   ├── errors/               # Custom error classes (AppError, ValidationError, etc.)
│   │   ├── middleware/           # Auth, error handler, rate limiter, request ID
│   │   └── types/                # Shared TypeScript types
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── models/           # User model (Prisma + business logic)
│   │   │   ├── controllers/      # AuthController (register, login, refresh, logout)
│   │   │   ├── views/            # AuthView (token response serializer)
│   │   │   ├── routes.ts         # Express router
│   │   │   └── index.ts          # Public API
│   │   ├── ledger/
│   │   │   ├── models/           # Account, JournalEntry, JournalLine, Person models
│   │   │   ├── controllers/      # LedgerController, AccountController, PersonController
│   │   │   ├── views/            # LedgerView, AccountView, PersonView
│   │   │   ├── services/         # PostingEngine (deterministic voucher → journal mapping)
│   │   │   ├── routes.ts
│   │   │   └── index.ts
│   │   └── voice/                # Scaffolded only — empty for Phase 1
│   │       └── index.ts
│   └── workers/
│       └── ledgerPostingProcessor.ts  # Phase B processor (imported by worker.ts)
├── prisma/
│   ├── schema.prisma             # Full data model
│   └── migrations/               # Generated migrations
├── tests/
│   ├── unit/                     # Model-level tests (balance invariant, posting rules)
│   ├── integration/              # API endpoint tests (supertest)
│   └── fixtures/                 # Test data factories
├── package.json
└── tsconfig.json
```

---

#### Prisma Schema (`backend/prisma/schema.prisma`)

#### [NEW] `backend/prisma/schema.prisma`

Full double-entry schema as specified in Section 2:

```prisma
enum AccountType { ASSET LIABILITY EQUITY INCOME EXPENSE }
enum AccountSubtype { CASH_BANK PERSON EXPENSE_CATEGORY INCOME_CATEGORY EQUITY_CAPITAL }
enum CashFlowCategory { OPERATING INVESTING FINANCING NONE }
enum VoucherType { PAYMENT RECEIPT JOURNAL CONTRA }
enum EntrySource { VOICE MANUAL }

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String
  name          String
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  accounts      Account[]
  journalEntries JournalEntry[]
  people        Person[]
  sessions      Session[]
}

model Session {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  refreshToken String   @unique
  expiresAt    DateTime
  createdAt    DateTime @default(now())
  @@index([userId])
}

model Account {
  id               String           @id @default(uuid())
  userId           String
  user             User             @relation(fields: [userId], references: [id])
  name             String
  type             AccountType
  subtype          AccountSubtype
  personId         String?
  person           Person?          @relation(fields: [personId], references: [id])
  cashFlowCategory CashFlowCategory @default(NONE)
  cachedBalance    Decimal          @default(0) @db.Decimal(15, 2)
  postedThrough    DateTime?
  createdAt        DateTime         @default(now())
  journalLines     JournalLine[]
  @@unique([userId, name])
  @@index([userId, type])
}

model JournalEntry {
  id          String      @id @default(uuid())
  userId      String
  user        User        @relation(fields: [userId], references: [id])
  date        DateTime    @db.Date
  narration   String
  voucherType VoucherType
  source      EntrySource @default(MANUAL)
  postedAt    DateTime?
  createdAt   DateTime    @default(now())
  lines       JournalLine[]
  @@index([userId, date])
}

model JournalLine {
  id             String       @id @default(uuid())
  journalEntryId String
  journalEntry   JournalEntry @relation(fields: [journalEntryId], references: [id], onDelete: Cascade)
  accountId      String
  account        Account      @relation(fields: [accountId], references: [id])
  debitAmount    Decimal      @default(0) @db.Decimal(15, 2)
  creditAmount   Decimal      @default(0) @db.Decimal(15, 2)
  @@index([accountId])
  @@index([journalEntryId])
}

model Person {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  name      String
  phone     String?
  address   String?
  label     String?
  createdAt DateTime @default(now())
  accounts  Account[]
  @@index([userId, name])
}
```

Key decisions:
- `Decimal(15,2)` for all monetary amounts — never float.
- `@@unique([userId, name])` on accounts prevents duplicate account names per user.
- `@@index([userId, date])` on journal entries for efficient date-range queries.
- `onDelete: Cascade` on journal lines — if an entry is deleted (admin correction), lines go with it.
- `postedAt` on JournalEntry supports idempotent Phase B worker.

---

#### PostgreSQL Constraint Trigger

#### [NEW] `deploy/postgres/01-balance-trigger.sql`

Deferred constraint trigger that fires at `COMMIT` time and verifies `SUM(debit) == SUM(credit)` for every journal entry touched in the transaction. This is the **database-level safety net** backing up the application-level check:

```sql
CREATE OR REPLACE FUNCTION check_journal_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF (
        SELECT ABS(SUM(debit_amount) - SUM(credit_amount))
        FROM journal_lines
        WHERE journal_entry_id = NEW.journal_entry_id
    ) > 0.001 THEN
        RAISE EXCEPTION 'Journal entry % is out of balance: debits ≠ credits',
            NEW.journal_entry_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_check_journal_balance
AFTER INSERT OR UPDATE ON journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_journal_balance();
```

---

### Auth Module

#### [NEW] `src/modules/auth/models/UserModel.ts`
- `register(email, password, name)` — validates input, hashes password (bcrypt, 12 rounds), creates user + default accounts (Cash, Bank, Opening Capital) in a single transaction.
- `authenticate(email, password)` — verifies credentials, returns user object.
- `createSession(userId)` — generates access token (JWT, 15min) + refresh token (UUID, stored in `sessions` table, 7-day expiry).
- `refreshSession(refreshToken)` — validates refresh token, rotates it, returns new access + refresh tokens.
- `revokeSession(refreshToken)` — deletes session row.

#### [NEW] `src/modules/auth/controllers/AuthController.ts`
Thin handlers: `register`, `login`, `refresh`, `logout`. Each parses request, calls model, hands to view.

#### [NEW] `src/modules/auth/views/AuthView.ts`
Serializes `{ accessToken, refreshToken, user: { id, email, name } }`.

#### [NEW] `src/modules/auth/routes.ts`
`POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`.

---

### Ledger Module — Models (Fat, Business Rules Here)

#### [NEW] `src/modules/ledger/models/AccountModel.ts`
- `createAccount(userId, { name, type, subtype, personId?, cashFlowCategory? })` — validates uniqueness, creates account.
- `getAccounts(userId, filters?)` — list with optional type/subtype filter.
- `getAccountWithBalance(accountId, userId)` — returns account; if `cachedBalance` is stale (no `postedThrough` or pending entries exist after it), computes live balance from `SUM(debit) - SUM(credit)` over journal_lines.
- `getChartOfAccounts(userId)` — grouped by type.
- Default account seeding logic (called from `UserModel.register`).

#### [NEW] `src/modules/ledger/models/JournalEntryModel.ts`
This is the **critical model** — owns the balance invariant.

- `create(userId, { date, narration, voucherType, source, lines: [{ accountId, debitAmount, creditAmount }] })`:
  1. Validates all lines' accounts belong to `userId`.
  2. **Checks balance invariant in memory**: `SUM(debitAmount) === SUM(creditAmount)`. If not → throws `UnbalancedEntryError`. This is the primary enforcement point.
  3. Validates each line has exactly one of debit/credit > 0, not both.
  4. Wraps in `prisma.$transaction`: creates `JournalEntry` + all `JournalLines` atomically.
  5. On success, enqueues a `ledger-posting` job to BullMQ with the new `journalEntryId`.
  6. Returns the created entry.

- `getById(entryId, userId)` — with lines and account info.
- `listByDateRange(userId, startDate, endDate, pagination)`.

#### [NEW] `src/modules/ledger/models/PersonModel.ts`
- `create(userId, { name, phone?, address?, label? })` — creates person + linked account (type=ASSET, subtype=PERSON). The linked account is always created.
- `findByName(userId, name)` — returns matches (may be multiple for disambiguation).
- `list(userId)`.

---

### Ledger Module — Posting Engine (Deterministic Rules)

#### [NEW] `src/modules/ledger/services/PostingEngine.ts`

Stateless service that maps semantic voucher input to balanced journal lines. This is the deterministic heart of the system — no LLM, no guessing.

```typescript
interface VoucherInput {
  voucherType: VoucherType;
  amount: Decimal;
  date: Date;
  narration: string;
  // For Payment/Receipt:
  cashAccountId?: string;      // Cash or Bank account
  counterAccountId?: string;   // Expense, Income, or Person account
  // For Contra:
  fromAccountId?: string;      // Source cash/bank account
  toAccountId?: string;        // Destination cash/bank account
  // For Journal:
  lines?: { accountId: string; debitAmount: Decimal; creditAmount: Decimal }[];
}
```

Methods:
- `buildJournalLines(input: VoucherInput): JournalLine[]` — applies the deterministic mapping:
  - **Payment**: Debit `counterAccount`, Credit `cashAccount`
  - **Receipt**: Debit `cashAccount`, Credit `counterAccount`
  - **Contra**: Debit `toAccount`, Credit `fromAccount`
  - **Journal**: pass-through (user specifies lines directly)
- Always validates balance before returning. Throws if unbalanced.

---

### Ledger Module — Controllers (Thin)

#### [NEW] `src/modules/ledger/controllers/LedgerController.ts`
- `postVoucher(req, res)` — parses voucher input, calls `PostingEngine.buildJournalLines()`, then `JournalEntryModel.create()`, returns via `LedgerView`.
- `getAccountLedger(req, res)` — calls model for journal lines for one account in date order with running balance.
- `getJournalEntry(req, res)` — single entry with lines.
- `listJournalEntries(req, res)` — date-range paginated list.

#### [NEW] `src/modules/ledger/controllers/AccountController.ts`
- `createAccount`, `listAccounts`, `getChartOfAccounts`.

#### [NEW] `src/modules/ledger/controllers/PersonController.ts`
- `createPerson`, `listPeople`, `getPerson`.

---

### Ledger Module — Views (Serializers)

#### [NEW] `src/modules/ledger/views/LedgerView.ts`
Formats journal entries, lines, and ledger (per-account running balance) into clean JSON for the frontend.

#### [NEW] `src/modules/ledger/views/AccountView.ts`
Serializes chart of accounts grouped by type with balances.

#### [NEW] `src/modules/ledger/views/PersonView.ts`
Serializes person list with their linked account balance (shows "owes you" or "you owe" based on sign).

---

### Core Infrastructure

#### [NEW] `src/core/config/index.ts`
Environment variable parsing with validation (zod schema). All config centralized.

#### [NEW] `src/core/database/prisma.ts`
Singleton Prisma client with connection pooling config.

#### [NEW] `src/core/redis/client.ts`
ioredis singleton, `maxRetriesPerRequest: null` for BullMQ compatibility.

#### [NEW] `src/core/queue/ledgerPostingQueue.ts`
BullMQ `Queue` instance for `ledger-posting` jobs. Imported by both `server.ts` and `worker.ts` entry points.

#### [NEW] `src/core/middleware/auth.ts`
JWT verification middleware. Extracts `userId` from token, attaches to `req`. Returns 401 on invalid/expired.

#### [NEW] `src/core/middleware/errorHandler.ts`
Global error handler. Maps `AppError` subclasses to HTTP status codes. Logs structured error + request ID.

#### [NEW] `src/core/middleware/rateLimiter.ts`
Redis-backed sliding window rate limiter. Per-user, configurable per-route.

#### [NEW] `src/core/middleware/requestId.ts`
Generates or extracts `X-Request-ID` header, attaches to request context for tracing.

#### [NEW] `src/core/errors/index.ts`
`AppError`, `ValidationError`, `UnbalancedEntryError`, `NotFoundError`, `AuthenticationError`, `AuthorizationError`.

---

### BullMQ Ledger-Posting Worker (inside `backend/`)

Runs as a **separate Node.js process** from the same backend codebase — started via `npm run worker` (which runs `ts-node src/worker.ts`). Shares all models, Prisma client, Redis config, and queue definitions with the API server — no code duplication, no cross-package imports.

#### [NEW] `backend/src/worker.ts`
Entry point: creates a BullMQ `Worker` on the `ledger-posting` queue, registers the processor, sets up graceful shutdown (SIGINT/SIGTERM).

#### [NEW] `backend/src/workers/ledgerPostingProcessor.ts`

The Phase B processor:
1. Receives `{ journalEntryId }` from the queue.
2. Reads the journal entry — **if `postedAt` is already set, no-ops** (idempotent).
3. For each journal line, updates the associated account's `cachedBalance`:
   - Simply adds the line amounts to the running sum — the sign convention is handled at query/display time, not storage time.
4. Sets `postedAt = now()` and `postedThrough` on each affected account.
5. All balance updates + `postedAt` in a single transaction.
6. Logs the posting outcome for observability.

**Retry policy**: 3 retries with exponential backoff (1s, 4s, 16s). Dead-letter queue for persistent failures.

---

### `frontend/` — React Frontend (Vite)

#### Scaffolded with:
```bash
npm create vite@latest frontend -- --template react-ts
```

#### Key pages and components:

```
frontend/src/
├── main.tsx
├── App.tsx                       # Router setup
├── index.css                     # Design system: tokens, utilities
├── api/                          # API client (axios/fetch wrapper)
│   ├── client.ts                 # Base client with auth interceptor
│   ├── auth.ts                   # Auth endpoints
│   └── ledger.ts                 # Ledger endpoints
├── context/
│   └── AuthContext.tsx            # Auth state provider
├── hooks/
│   ├── useAuth.ts
│   └── useLedger.ts
├── pages/
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── DashboardPage.tsx         # Account summary with balances
│   ├── ChartOfAccountsPage.tsx   # Manage accounts
│   ├── VoucherEntryPage.tsx      # Create Payment/Receipt/Contra/Journal
│   ├── AccountLedgerPage.tsx     # Per-account journal lines + running balance
│   ├── JournalBookPage.tsx       # All entries, filterable by date
│   └── PeoplePage.tsx            # Manage contacts
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── TopBar.tsx
│   │   └── AppLayout.tsx
│   ├── voucher/
│   │   ├── PaymentForm.tsx
│   │   ├── ReceiptForm.tsx
│   │   ├── ContraForm.tsx
│   │   └── JournalForm.tsx
│   ├── ledger/
│   │   ├── LedgerTable.tsx
│   │   └── RunningBalanceRow.tsx
│   ├── accounts/
│   │   ├── AccountList.tsx
│   │   └── CreateAccountModal.tsx
│   └── common/
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Select.tsx
│       ├── Modal.tsx
│       ├── DataTable.tsx
│       ├── DatePicker.tsx
│       └── AmountInput.tsx
└── utils/
    ├── formatCurrency.ts
    └── formatDate.ts
```

#### Design direction:
- **Dark mode first** — deep slate/charcoal backgrounds, accent color (emerald/teal for finance)
- **Glassmorphism** cards for dashboard account summaries
- **Inter font** via Google Fonts
- **Smooth micro-animations** — form transitions, table row hover, sidebar collapse
- **Premium feel** — generous whitespace, subtle gradients, glow effects on focus states
- Tables styled for readability (alternating rows, sticky headers, monospace amounts)

---

### Deploy / Docker

#### [NEW] `deploy/docker/api.Dockerfile`
Multi-stage build: install → build → production image. Runs Prisma generate + migrate on start.

#### [NEW] `deploy/docker/worker.Dockerfile`
Same pattern. Shares Prisma client with api.

#### [NEW] `deploy/docker/web.Dockerfile`
Build step → nginx serving static files.

---

## Verification Plan

### Automated Tests

The balance invariant is the #1 test priority. All tests run from `backend/`:
```bash
cd backend
npm test              # All tests
npm run test:unit     # Unit tests only (models, posting engine)
npm run test:int      # Integration tests (API endpoints, requires Docker DB)
```

#### Unit Tests (backend/tests/unit/)

| Test file | What it covers |
|---|---|
| `JournalEntryModel.test.ts` | **Balance invariant**: unbalanced entries are rejected; balanced entries succeed; zero-amount lines rejected; all accounts must belong to user |
| `PostingEngine.test.ts` | Every voucher type mapping: Payment debits expense/credits cash, Receipt debits cash/credits income, Contra debits bank/credits cash, Journal pass-through. Edge cases: zero amounts, missing accounts |
| `AccountModel.test.ts` | Default account creation on signup; duplicate name rejection; balance computation from journal lines |
| `UserModel.test.ts` | Registration with password hashing; authentication; session creation/rotation/revocation |

#### Integration Tests (backend/tests/integration/)

| Test file | What it covers |
|---|---|
| `auth.test.ts` | Full register → login → refresh → logout flow; invalid credentials; expired tokens |
| `voucher-posting.test.ts` | POST a Payment voucher → verify journal entry created → verify queue job enqueued → run worker → verify `cachedBalance` updated and `postedAt` set |
| `ledger-queries.test.ts` | Get account ledger with running balance; filter by date range; pagination |
| `balance-invariant-db.test.ts` | Attempt to insert unbalanced lines directly via raw SQL → verify DB trigger rejects |
| `idempotent-worker.test.ts` | Process same journal entry twice → verify balance not double-counted |

### Manual Verification
- Register a new user → verify default accounts (Cash, Bank, Opening Capital) created
- Create a Payment voucher → verify it appears in the journal book and account ledger with correct running balance
- Create a Receipt voucher → same
- Create a Contra voucher (Cash → Bank) → verify both accounts update
- Create a Journal voucher with explicit lines → verify balance enforcement (try submitting unbalanced → should fail)
- Add a person → verify linked account created
- Post a person transaction → verify person's balance shows correctly
