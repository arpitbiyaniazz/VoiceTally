# VoiceTally 🎙️₹

**VoiceTally** is a production-grade, high-performance financial ledger system that pairs strict zero-discrepancy **Double-Entry Accounting** with an **Intelligent Conversational Voice Agent**.

---

## 🌟 Key Features

### 1. 🎙️ Conversational AI Voice Agent
Perform end-to-end accounting using natural spoken language or text input:
- **ATM Bank Withdrawals & Deposits (Contra Vouchers)**:
  - *"I made the withdrawal from the bank 10,000"* $\to$ $Dr\text{ Cash}, Cr\text{ Bank}$ (₹10,000)
  - *"Deposited 8,000 cash into bank"* $\to$ $Dr\text{ Bank}, Cr\text{ Cash}$ (₹8,000)
- **Customer Purchases on Credit (Sundry Debtors)**:
  - *"Rahul bought laptop for 45,000"* $\to$ $Dr\text{ Rahul (Debtor Account)}, Cr\text{ Sales Revenue}$ (₹45,000)
- **Debt Collections & Receipts**:
  - *"I take 5,000 muny from Rahul in cash"* $\to$ $Dr\text{ Cash}, Cr\text{ Rahul (Debtor Account)}$ (₹5,000)
  - *"Vikram paid 15,000 via bank transfer"* $\to$ $Dr\text{ Bank}, Cr\text{ Vikram}$ (₹15,000)
- **Expense Payments**:
  - *"Paid 3,500 for electricity bill using Bank"* $\to$ $Dr\text{ Electricity Expense}, Cr\text{ Bank}$ (₹3,500)
- **Instant Spoken Queries & Financial Intelligence (TTS & Visual Cards)**:
  - *"What is my bank balance?"*
  - *"How much cash do I have?"*
  - *"How much does Rahul owe me?"*
  - *"What is my net worth?"*
  - *"How much did I spend this month?"*

---

### 2. ⚖️ Zero-Discrepancy Double-Entry Accounting Engine
- **Mathematical Invariant Enforcement**: Every transaction satisfies $\sum \text{Debits} = \sum \text{Credits}$. Unbalanced entries are rejected atomically at the database and application levels.
- **Voucher Classification**: Support for `RECEIPT`, `PAYMENT`, `CONTRA`, and `JOURNAL` vouchers with automated sub-ledger postings.
- **Account Types**: `ASSET`, `LIABILITY`, `EQUITY`, `INCOME`, `EXPENSE` with automatic normal-balance classification.
- **People & Contacts Sub-Ledger**: Contact accounts mapped to `ASSET (PERSON)` for debtors ($Dr > Cr$) and creditors ($Cr > Dr$).
- **Financial Reports**:
  - **Trial Balance**: Complete verification that total debits match total credits.
  - **Profit & Loss**: Dynamic revenue vs. expense accounting with net profit computation.
  - **Balance Sheet**: Real-time asset, liability, and equity reconciliation ($\text{Assets} = \text{Liabilities} + \text{Equity}$).
  - **Cash Flow Statement**: Categorized by Operating, Investing, and Financing flows.
  - **Account Ledger**: Chronological transaction statements with running balances.

---

## 🏗️ System Architecture

```
VoiceTally/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/           # JWT authentication, argon2 password hashing
│   │   │   ├── ledger/         # Accounts, Journal Entries, People & Financial Reports
│   │   │   └── voice/          # NLP Parser, Intent Classifier & Voice Agent Service
│   │   ├── prisma/             # Schema & PostgreSQL migrations
│   │   └── app.ts              # Express API server with CORS & security middleware
│   ├── tests/                  # Vitest unit & integration tests
│   └── scripts/                # Automated QA bug-hunting agent
├── frontend/
│   ├── src/
│   │   ├── api/                # Axios client & REST endpoints
│   │   ├── components/
│   │   │   ├── layout/         # AppLayout, Sidebar
│   │   │   └── voice/          # VoiceAgentModal, VoiceFloatingButton, animated waveforms
│   │   ├── hooks/              # useSpeechRecognition (Web Speech API STT + TTS)
│   │   └── pages/              # Dashboard, VoiceStudio, Vouchers, Journal, Accounts, People, Reports
│   └── tests/                  # Frontend UI and component tests
└── deploy/
    └── docker/                 # Dockerfiles for API, Worker, and Web
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 16+ (or Docker)
- Redis 7+ (or Docker)

### Option 1: Quickstart with Docker Compose

```bash
# Clone the repository
git clone https://github.com/arpitbiyaniazz/VoiceTally.git
cd VoiceTally

# Launch PostgreSQL, Redis, API, and Frontend with Docker Compose
docker compose up -d
```

Frontend will be accessible at `http://localhost:5173`, and Backend API at `http://localhost:3001`.

---

### Option 2: Local Development Setup

#### 1. Backend Setup
```bash
cd backend
npm install

# Configure environment variables
cp .env.example .env

# Run database migrations and auto-seed
npx prisma migrate dev

# Start development API server
npm run dev
```

#### 2. Frontend Setup
```bash
cd frontend
npm install

# Start Vite development server
npm run dev
```

---

## 🧪 Testing & Quality Assurance

### Run Backend Unit & Integration Tests (34 Tests)
```bash
cd backend
npm test
```

### Run Automated QA Subagent Audit Suite (26 Invariant Tests)
```bash
cd backend
npm run qa
```

### Run Frontend Tests & Linter (9 Tests)
```bash
cd frontend
npm test
npm run lint
npm run build
```

---

## 🔒 Security & Best Practices
- **Strict Invariant Checks**: DB Transactions with row locking to prevent race conditions during voucher posting.
- **Safe Authentication**: HTTPOnly/Bearer JWT token rotation with Redis session revocation.
- **Audio Privacy**: Zero server-side audio storage — audio processing is handled via standard browser Web Speech APIs and text transcripts.
