import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import './AuthPages.css';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    if (loading) return;
    setEmail('demo@voicetally.app');
    setPassword('demopass123');
    setError('');
    setLoading(true);
    try {
      await login('demo@voicetally.app', 'demopass123');
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-brand">
          <div className="auth-logo">₹</div>
          <h1 className="auth-title">VoiceTally</h1>
          <p className="auth-subtitle">Voice-first accounting & double-entry ledger</p>
        </div>

        <form className="auth-form glass-card" onSubmit={handleSubmit}>
          <h2 className="auth-form-title">Welcome back</h2>
          <p className="auth-form-subtitle">Sign in to manage your financial books</p>

          {/* 1-Click Demo Login Banner */}
          <div className="demo-login-box">
            <div className="demo-login-info">
              <span className="demo-badge">QUICK DEMO</span>
              <span className="demo-text">Explore with pre-seeded test data & accounts</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm w-full mt-xs demo-btn"
              onClick={handleDemoLogin}
              disabled={loading}
            >
              ⚡ 1-Click Demo Login (demo@voicetally.app)
            </button>
          </div>

          <div className="auth-divider">
            <span>or sign in with email</span>
          </div>

          {error && <div className="auth-error">⚠️ {error}</div>}

          <div className="form-group">
            <label className="label" htmlFor="login-email">Email Address</label>
            <input
              id="login-email"
              type="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-lg w-full mt-sm" disabled={loading}>
            {loading ? <span className="spinner" /> : 'Sign In ➔'}
          </button>

          <p className="auth-switch">
            Don't have an account? <Link to="/register">Create one free</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
