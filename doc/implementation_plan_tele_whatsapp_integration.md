# Implementation Plan: WhatsApp & Telegram Voice Companion Bot Integration

Build a production-grade **WhatsApp & Telegram Voice Companion Bot Integration** for **VoiceTally**, enabling users to record double-entry accounting transactions, query live balances, and confirm vouchers on-the-go via text and voice audio notes directly from WhatsApp and Telegram.

---

## Proposed Architecture & Workflow

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                      VOICETALLY COMPANION BOT ARCHITECTURE                            │
├────────────────────────────────┬──────────────────────────────┬───────────────────────┤
│ 💬 WhatsApp Cloud / Twilio API │ ✈️ Telegram Bot API Webhook  │ 📱 Live Bot Simulator │
│ • Voice audio note / text      │ • Audio / Voice message      │ • Interactive UI mock │
│ • Webhook signature verify     │ • /start <token> pairing     │ • 1-click testing     │
│ • Sender phone lookup          │ • ChatId user lookup         │ • Real-time preview   │
└────────────────────────────────┴──────────────────────────────┴───────────────────────┘
                                   │
                                   ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│               CONVERSATIONAL ACCOUNTING ENGINE & REDIS STATE                          │
│ • VoiceParser / NLP intent detection (Hinglish/Indian multiplier support)            │
│ • Double-Entry Preview Card generation (Debits = Credits)                            │
│ • Distributed Redis pending session (2-Step Reconfirmation)                           │
│ • Instant confirmation ("YES" / "HAAN" / "CANCEL") ➔ BullMQ Ledger Execution         │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### 1. Database & Prisma Schema
- Add fields to `User` model:
  - `phone`: `String?` (Unique phone number for WhatsApp routing)
  - `telegramChatId`: `String?` (Unique chat ID for Telegram routing)
  - `botPairingCode`: `String?` (Temporary pairing token for Telegram `/start` or WhatsApp pairing)
- Update `EntrySource` enum: add `WHATSAPP` and `TELEGRAM`.

### 2. Backend Integration Service Layer
- **`WhatsAppBotService.ts`**:
  - Handles Meta Cloud API / Twilio webhook JSON and form payloads.
  - Normalizes sender phone numbers (`+919876543210` $\leftrightarrow$ `9876543210`).
  - Processes voice notes / transcripts via `VoiceAgentService`.
  - Formats rich WhatsApp messages with emoji styling, double-entry breakdown, and confirmation guidance.
- **`TelegramBotService.ts`**:
  - Handles Telegram updates (`message.text`, `message.voice`, `message.audio`, `callback_query`).
  - Supports `/start <pairingCode>` pairing flow and `/balance`, `/expenses`, `/pnl` quick commands.
  - Emits inline keyboard buttons for `[✅ Confirm Entry]` and `[❌ Cancel]`.
- **`IntegrationsController.ts` & `routes.ts`**:
  - `GET /api/v1/integrations/whatsapp/webhook` (Meta hub challenge verification).
  - `POST /api/v1/integrations/whatsapp/webhook` (WhatsApp message webhook).
  - `POST /api/v1/integrations/telegram/webhook` (Telegram update webhook).
  - `GET /api/v1/integrations/status` (User's phone, Telegram link status, pairing code, webhook endpoints).
  - `POST /api/v1/integrations/link-phone` (Update & verify user's WhatsApp number).
  - `POST /api/v1/integrations/simulator/chat` (Interactive Chat Simulator endpoint).

### 3. Frontend Bot Companion Studio & Interactive Simulator
- **New Page**: `frontend/src/pages/IntegrationsPage.tsx` & `IntegrationsPage.css`:
  - **WhatsApp Setup Card**: Phone number input, verification status, QR code pairing, and webhook copy-paste guides.
  - **Telegram Setup Card**: Bot handle (`@VoiceTallyBot`), 1-click `/start` deep link, pairing token.
  - **Interactive Mobile Smartphone Simulator**:
    - Real-time smartphone frame toggleable between WhatsApp (green theme) and Telegram (blue theme).
    - Chat message stream with audio wave messages, double-entry voucher preview bubbles, and interactive action buttons.
    - Test sample voice notes: *"Sharma ji paid 5000 cash"*, *"What is my bank balance?"*, *"Paid 1200 for petrol"*.
- **Sidebar Navigation**: Add **💬 Bot Integrations** to sidebar navigation.

---

## Proposed Changes

### Backend

#### [MODIFY] [schema.prisma](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/backend/prisma/schema.prisma)
- Add `phone`, `telegramChatId`, `botPairingCode` to `User` model, and `WHATSAPP`, `TELEGRAM` to `EntrySource`.

#### [NEW] [WhatsAppBotService.ts](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/backend/src/modules/integrations/services/WhatsAppBotService.ts)
- Webhook processor and response formatter for WhatsApp messages and voice notes.

#### [NEW] [TelegramBotService.ts](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/backend/src/modules/integrations/services/TelegramBotService.ts)
- Webhook processor and inline button handler for Telegram bot messages.

#### [NEW] [IntegrationsController.ts](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/backend/src/modules/integrations/controllers/IntegrationsController.ts)
- Controller for WhatsApp/Telegram webhooks, user account pairing, and simulator API.

#### [NEW] [routes.ts](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/backend/src/modules/integrations/routes.ts)
- Integration routes mounted at `/api/v1/integrations`.

#### [MODIFY] [app.ts](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/backend/src/app.ts)
- Mount `integrationRoutes`.

---

### Frontend

#### [NEW] [IntegrationsPage.tsx](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/frontend/src/pages/IntegrationsPage.tsx)
- Bot companion setup cards + interactive live mobile WhatsApp/Telegram simulator.

#### [NEW] [IntegrationsPage.css](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/frontend/src/pages/IntegrationsPage.css)
- Mobile phone mockup styling, chat bubbles, audio waveforms, and status pill badges.

#### [MODIFY] [ledger.ts](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/frontend/src/api/ledger.ts)
- Add integration API client methods (`getIntegrationStatus`, `linkPhone`, `simulateBotMessage`).

#### [MODIFY] [Sidebar.tsx](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/frontend/src/components/layout/Sidebar.tsx) & [App.tsx](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/frontend/src/App.tsx)
- Add `/integrations` route and sidebar navigation link.

---

## Verification Plan

### Automated Tests
- Integration tests in `backend/tests/integration/CompanionBot.test.ts`:
  - Verify WhatsApp incoming text & voice webhook parsing.
  - Verify Telegram incoming command & inline callback parsing.
  - Verify two-step reconfirmation flow over WhatsApp/Telegram (Preview $\rightarrow$ Yes $\rightarrow$ Posted).
  - Verify phone number resolution & security guardrails.
- Frontend tests in `frontend/src/tests/IntegrationsPage.test.tsx`:
  - Verify linking form, phone input validation, and mobile simulator chat messaging.

### Manual Verification
- Test interactive chat simulator in WhatsApp and Telegram modes.
- Verify live transaction posting from simulator appears immediately in Journal Book and Dashboard balance.
