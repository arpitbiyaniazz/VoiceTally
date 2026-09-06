import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import './AuthPages.css';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(email, password, name);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Registration failed');
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
          <p className="auth-subtitle">Your voice-driven ledger</p>
        </div>

        <form className="auth-form glass-card" onSubmit={handleSubmit}>
          <h2 className="auth-form-title">Create your account</h2>
          <p className="auth-form-subtitle">Start managing your finances</p>

          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label className="label" htmlFor="register-name">Full Name</label>
            <input
              id="register-name"
              type="text"
              className="input"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="register-email">Email</label>
            <input
              id="register-email"
              type="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="register-password">Password</label>
            <input
              id="register-password"
              type="password"
              className="input"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
            {loading ? <span className="spinner" /> : 'Create Account'}
          </button>

          <p className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
