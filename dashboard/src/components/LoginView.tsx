'use client';

import React, { useState, FormEvent } from 'react';
import { loginWithEmail } from '../firebase/auth';
import type { User } from 'firebase/auth';

interface LoginViewProps {
  onLoginSuccess?: (user: User) => void;
}

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setError('');
    setLoading(true);

    try {
      const cred = await loginWithEmail(email.trim(), password);
      if (onLoginSuccess && cred?.user) {
        onLoginSuccess(cred.user);
      }
    } catch (err: unknown) {
      let msg = 'Login failed';
      const firebaseErr = err as { code?: string; message?: string };
      if (
        firebaseErr.code === 'auth/user-not-found' ||
        firebaseErr.code === 'auth/wrong-password' ||
        firebaseErr.code === 'auth/invalid-credential'
      ) {
        msg = 'Invalid email or password';
      } else if (firebaseErr.code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Try again later.';
      } else if (firebaseErr.code === 'auth/network-request-failed') {
        msg = 'Network error. Check your connection.';
      } else if (firebaseErr.message) {
        msg = firebaseErr.message;
      }
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-app-icon">
          <img src="/favicon.svg" width={38} height={38} alt="Smart Water Tank" />
        </div>
        <h1 className="login-title">
          Smart Water Tank <span className="login-title-dot"></span>
        </h1>
        <p className="login-sub">Cloud IoT Monitoring & Autonomous Control</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label>Operator Email</label>
            <div className="input-wrapper">
              <span className="input-icon">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                </svg>
              </span>
              <input
                type="email"
                id="authEmail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@gmail.com"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="input-group">
            <label>Secret Password</label>
            <div className="input-wrapper">
              <span className="input-icon">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                id="authPass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="pwd-toggle"
                onClick={() => setShowPassword(!showPassword)}
                title="Toggle password visibility"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {showPassword ? (
                    <path d="m9.88 9.88a3 3 0 1 0 4.24 4.24m-6.72-2.12a10.05 10.05 0 0 0-5.4 7c3-7 10-7 10-7 2.1 0 4 .6 5.6 1.7m3.4 3.3A9.97 9.97 0 0 1 22 19s-3 7-10 7a10.03 10.03 0 0 1-7-3m-3-15L21 21" />
                  ) : (
                    <>
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error active" id="authError">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0 }}
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="login-btn" id="authBtn" disabled={loading}>
            {loading ? (
              <>
                <span>Signing in...</span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ animation: 'spin 1s linear infinite' }}
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              </>
            ) : (
              <>
                <span>Sign In to Station</span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>Secured by Firebase Cloud RTDB</span>
        </div>
      </div>
    </div>
  );
}
