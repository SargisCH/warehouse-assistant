import React, { useEffect, useState } from 'react';
import { fetchAuthSession, signOut } from 'aws-amplify/auth';
import { request, ApiError } from './api';
import { Access } from './types';
import Login from './Login';
import Workspace from './Workspace';

export default function App({ configured }: { configured: boolean }) {
  const [state, setState] = useState<
    'loading' | 'signedOut' | 'allowed' | 'denied' | 'error'
  >('loading');
  const [email, setEmail] = useState('');
  const [accountKey, setAccountKey] = useState('');
  const [error, setError] = useState('');
  async function verify() {
    setState('loading');
    try {
      const session = await fetchAuthSession();
      if (!session.tokens?.accessToken) {
        setState('signedOut');
        return;
      }
      const access = await request<Access>('assistant/access');
      setAccountKey(`${access.userId}:${access.tenantId}`);
      setEmail(String(session.tokens.idToken?.payload?.email || 'Developer'));
      setState(access.assistantAccess === 'DEVELOPER' ? 'allowed' : 'denied');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState('signedOut');
      else if (e instanceof ApiError && e.status === 403) setState('denied');
      else {
        setError(
          'Could not verify your access. Check your connection and try again.',
        );
        setState('error');
      }
    }
  }
  useEffect(() => {
    if (!configured) return;
    let live = true;
    (async () => {
      try {
        const session = await fetchAuthSession();
        if (!live) return;
        if (!session.tokens?.accessToken) {
          setState('signedOut');
          return;
        }
        const access = await request<Access>('assistant/access');
        if (!live) return;
        setAccountKey(`${access.userId}:${access.tenantId}`);
        setEmail(String(session.tokens.idToken?.payload?.email || 'Developer'));
        setState(access.assistantAccess === 'DEVELOPER' ? 'allowed' : 'denied');
      } catch (e) {
        if (!live) return;
        if (e instanceof ApiError && e.status === 403) setState('denied');
        else if (e instanceof ApiError && e.status !== 401) {
          setError(
            'Could not verify your access. Check the API configuration and connection.',
          );
          setState('error');
        } else setState('signedOut');
      }
    })();
    return () => {
      live = false;
    };
  }, [configured]);
  async function logout() {
    setState('loading');
    try {
      await signOut();
      setEmail('');
      setState('signedOut');
    } catch {
      setError('Sign out failed. Please retry.');
      setState('error');
    }
  }
  if (!configured)
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <Brand />
          <h1>Connect your assistant</h1>
          <p>
            Configure the Cognito user pool and dedicated app client in the
            assistant app’s environment, then restart it.
          </p>
          <p>
            Use the same user pool as Warehouse. This app does not create
            accounts.
          </p>
        </section>
      </main>
    );
  if (state === 'loading')
    return (
      <main className="auth-shell">
        <section className="auth-card" role="status">
          <Brand />
          <p>Checking your account…</p>
        </section>
      </main>
    );
  if (state === 'signedOut') return <Login onAuthenticated={verify} />;
  if (state === 'denied')
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <Brand />
          <h1>Developer access required</h1>
          <p>
            This account cannot open the review workspace. Ask a developer to
            grant access to the correct tenant.
          </p>
          <button onClick={logout}>Sign in with another account</button>
        </section>
      </main>
    );
  if (state === 'error')
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <Brand />
          <h1>Unable to connect</h1>
          <p role="alert">{error}</p>
          <div className="actions">
            <button onClick={verify}>Retry</button>
            <button className="secondary" onClick={logout}>
              Sign out
            </button>
          </div>
        </section>
      </main>
    );
  return (
    <Workspace
      key={accountKey}
      accountKey={accountKey}
      sessionChanged={verify}
      email={email}
      logout={logout}
      accessLost={() => setState('denied')}
    />
  );
}
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        W
      </span>
      <span>
        Warehouse <b>Assistant</b>
      </span>
    </div>
  );
}
