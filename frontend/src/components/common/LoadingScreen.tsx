import { useState, useEffect } from 'react';

export function LoadingScreen({ message }: { message?: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="loading-center" style={{ minHeight: '60vh', flexDirection: 'column', textAlign: 'center', gap: '16px' }}>
      <div className="spinner" style={{ width: '36px', height: '36px' }} />
      {elapsed >= 3 ? (
        <div style={{ maxWidth: '420px', padding: '16px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', animation: 'fadeIn 0.3s ease-in' }}>
          <p style={{ margin: '0 0 6px 0', fontWeight: 600, color: 'var(--color-text-primary, #fff)', fontSize: '15px' }}>
            {elapsed >= 15 ? 'Booting Cloud Server...' : 'Connecting to Server...'}
          </p>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary, #94a3b8)', lineHeight: 1.5 }}>
            {elapsed >= 15
              ? 'Render free instances sleep when idle. The container is spinning up (~30-50s) and will be ready momentarily.'
              : message || 'Free cloud tier is waking up from standby mode. Thank you for your patience!'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
