import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { AppLayout } from './components/layout/AppLayout';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { VoucherEntryPage } from './pages/VoucherEntryPage';
import { ChartOfAccountsPage } from './pages/ChartOfAccountsPage';
import { AccountLedgerPage } from './pages/AccountLedgerPage';
import { JournalBookPage } from './pages/JournalBookPage';
import { PeoplePage } from './pages/PeoplePage';
import { ReportsPage } from './pages/ReportsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { VoiceStudioPage } from './pages/VoiceStudioPage';
import { IntegrationsPage } from './pages/IntegrationsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-center"><div className="spinner" /></div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-center"><div className="spinner" /></div>;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/voice" element={<VoiceStudioPage />} />
              <Route path="/voice-studio" element={<VoiceStudioPage />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
              <Route path="/vouchers" element={<VoucherEntryPage />} />
              <Route path="/journal" element={<JournalBookPage />} />
              <Route path="/accounts" element={<ChartOfAccountsPage />} />
              <Route path="/accounts/:accountId/ledger" element={<AccountLedgerPage />} />
              <Route path="/people" element={<PeoplePage />} />
              <Route path="/reports" element={<ReportsPage />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
