'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('sign-in'); // 'sign-in' | 'sign-up'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState({ msg: '', error: false });
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setStatus({ msg: '', error: false });

    if (mode === 'sign-up') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setStatus({ msg: error.message, error: true });
      } else {
        setStatus({
          msg: 'Account created. Check your email to confirm it, then sign in.',
          error: false,
        });
        setMode('sign-in');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setStatus({ msg: error.message, error: true });
      } else {
        router.push('/');
        router.refresh();
      }
    }
    setBusy(false);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--blueprint-darker)',
      }}
    >
      <div
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--grid-line-strong)',
          borderRadius: 10,
          padding: '36px 40px',
          width: 360,
          maxWidth: '90vw',
        }}
      >
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--copper)',
            display: 'block',
            marginBottom: 6,
          }}
        >
          Design &amp; Build Log
        </span>
        <h1
          style={{
            fontFamily: "'Big Shoulders Display', sans-serif",
            fontWeight: 800,
            fontSize: 30,
            lineHeight: 1,
            margin: '0 0 20px 0',
            color: 'var(--blueprint-dark)',
          }}
        >
          Engineering
          <br />
          Notebook
        </h1>

        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <label>Email</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
              required
            />
          </div>
          <div className="field-row">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? 'Please wait...' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className={'status-line' + (status.error ? ' error' : '')} style={{ marginTop: 12 }}>
          {status.msg}
        </div>

        <button
          onClick={() => {
            setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up');
            setStatus({ msg: '', error: false });
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--blueprint)',
            fontSize: 13,
            cursor: 'pointer',
            marginTop: 14,
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          {mode === 'sign-up' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
        </button>
      </div>
    </div>
  );
}
