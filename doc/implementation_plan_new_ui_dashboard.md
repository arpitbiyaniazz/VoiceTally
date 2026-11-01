# Implementation Plan: Interactive Financial Analytics & Visual BI Suite

Build a comprehensive, interactive Business Intelligence (BI) and data visualization suite for **VoiceTally**, featuring **Sankey Cash Flow River Diagram**, **Category Expense/Income Donut Visualizers**, **Predictive Cash Runway & Liquidity Simulator**, and **Monthly Financial Trends**.

---

## Proposed Architectural & Feature Design

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        VOICETALLY INTERACTIVE VISUAL BI SUITE                          │
├────────────────────────────────┬───────────────────────────────┬───────────────────────┤
│ 🌊 Sankey Cash Flow River      │ 🍩 Category Donut & Treemap   │ ⏳ Cash Runway & Burn │
│ • Income Streams ➔ Total Pool  │ • Interactive Expense Donuts  │ • Liquid Asset Pool   │
│ • Pool ➔ Expense Sinks & Save  │ • Income Distribution Slices  │ • Dynamic Burn Slider │
│ • Smooth SVG Bézier animation  │ • Hover tooltips & % shares   │ • 30/60/90d forecast  │
└────────────────────────────────┴───────────────────────────────┴───────────────────────┘
```

### 1. Backend Analytics Engine
- **New Analytics Controller & Model**: `backend/src/modules/ledger/controllers/AnalyticsController.ts` & `AnalyticsModel.ts`.
- **Endpoints**:
  - `GET /api/v1/ledger/analytics/summary` — High-level KPI metrics, liquidity ratio, average burn rate, estimated runway.
  - `GET /api/v1/ledger/analytics/trends` — Monthly time-series data (Inflow, Outflow, Net Profit over past 6 or 12 months).
  - `GET /api/v1/ledger/analytics/categories` — Categorical breakdown of Income and Expenses with percentage distribution.
  - `GET /api/v1/ledger/analytics/sankey` — Structured node & link flow graph mapping Income Accounts $\rightarrow$ Operating Pool $\rightarrow$ Expense Categories & Retained Savings.
- **Strict Double-Entry Aggregations**: All numbers calculated directly from immutable `JournalLine` and `Account` tables preserving mathematical balance.

### 2. Frontend Visual Intelligence Suite
- **New Page**: `frontend/src/pages/AnalyticsPage.tsx` & `AnalyticsPage.css`:
  - **Time Range Selector**: Last 30 Days, Last 90 Days, Last 6 Months, Year-to-Date.
  - **Sankey Cash Flow Visualizer**: Custom responsive SVG Bézier curve flow with hover highlight paths, flow amounts in INR, and source-to-sink breakdown.
  - **Category Donut Charts**: Interactive SVG Donut charts for Expense & Income breakdown with animated segments, legend selection, and center totals.
  - **Predictive Cash Runway Simulator**: Interactive sliders for monthly burn rate, receivable delay assumption, and dynamic runway gauge (Safe / Warning / Danger zone).
  - **Monthly Inflow vs Outflow Trends**: Dual-bar trendline showing income vs expenses and net monthly surplus/deficit.
- **Dashboard & Navigation Integration**:
  - Add **📊 Analytics** to the main sidebar and mobile navigation.
  - Add an interactive **Mini Analytics & Cash Flow Pulse** card to `DashboardPage.tsx` with 1-click drill-down to `/analytics`.
- **Zero-Dependency High-Performance SVG / Canvas Architecture**:
  - Ultra-crisp, responsive SVG components adhering to the WCAG 2.1 AAA high-contrast design system, dark-mode glassmorphism, smooth CSS transitions, and keyboard/screen-reader accessibility.

---

## Proposed Changes

### Backend

#### [NEW] [AnalyticsModel.ts](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/backend/src/modules/ledger/models/AnalyticsModel.ts)
- Implement aggregated queries for monthly trends, category shares, Sankey flow nodes/links, and liquidity/runway metrics.

#### [NEW] [AnalyticsController.ts](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/backend/src/modules/ledger/controllers/AnalyticsController.ts)
- Expose `/analytics/summary`, `/analytics/trends`, `/analytics/categories`, and `/analytics/sankey`.

#### [MODIFY] [routes.ts](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/backend/src/modules/ledger/routes.ts)
- Register the analytics routes under `/api/v1/ledger/analytics/*`.

---

### Frontend

#### [NEW] [AnalyticsPage.tsx](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/frontend/src/pages/AnalyticsPage.tsx)
- The flagship Visual BI & Data Storytelling page featuring:
  - Hero KPI Grid (Liquidity Pool, Avg Monthly Burn, Net Runway Days, Savings Rate).
  - Animated Interactive Sankey River Diagram.
  - Category Expense Donut Chart with interactive slice inspection.
  - Monthly Inflow vs Outflow Historical Trend Chart.
  - Live Predictive Cash Runway Simulator with adjustable sliders.

#### [NEW] [AnalyticsPage.css](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/frontend/src/pages/AnalyticsPage.css)
- Styling for glassmorphic charts, tooltips, slider controls, and responsive grid layouts.

#### [NEW] [SankeyFlowChart.tsx](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/frontend/src/components/analytics/SankeyFlowChart.tsx)
- Reusable, animated SVG Sankey component for visualizing income-to-expense financial flows.

#### [NEW] [CategoryDonutChart.tsx](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/frontend/src/components/analytics/CategoryDonutChart.tsx)
- Reusable SVG Donut Chart with arc geometry, hover focus, and color-coded legends.

#### [NEW] [TrendBarChart.tsx](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/frontend/src/components/analytics/TrendBarChart.tsx)
- Reusable monthly bar/trend component with tooltips and net delta indicators.

#### [MODIFY] [ledger.ts](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/frontend/src/api/ledger.ts)
- Add API client methods for analytics endpoints.

#### [MODIFY] [App.tsx](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/frontend/src/App.tsx)
- Add `/analytics` route and navigation link in sidebar and mobile header.

#### [MODIFY] [DashboardPage.tsx](file:///Users/arpitbiyaniaz/Documents/System%20Design/VoiceTally/frontend/src/pages/DashboardPage.tsx)
- Embed a sleek mini-analytics preview widget directing users to the full Analytics Studio.

---

## Verification Plan

### Automated Tests
- Unit & integration tests for `AnalyticsModel` and `AnalyticsController`:
  - `npm test` in `backend` to ensure 100% test pass rate with accurate aggregation math.
  - Component tests in `frontend` for chart rendering and slider interactions.

### Manual Verification
- Test all time filters (30d, 90d, 6m, 1y).
- Verify Sankey flow calculations match P&L and Balance Sheet totals.
- Verify Donut charts handle edge cases (0 expenses, 1 single category, multiple accounts).
- Test Cash Runway Simulator slider adjustments in real-time.
- Verify full responsiveness on mobile (375px) and desktop (1440px).
