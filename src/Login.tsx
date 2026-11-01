import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { signIn, confirmSignIn } from 'aws-amplify/auth';
import { Brand } from './App';
export default function Login({
  onAuthenticated,
}: {
  onAuthenticated: () => Promise<void>;
}) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState('');
  const [challenge, setChallenge] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const newPassword = step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED';
  const supported =
    !step ||
    newPassword ||
    [
      'CONFIRM_SIGN_IN_WITH_SMS_CODE',
      'CONFIRM_SIGN_IN_WITH_TOTP_CODE',
      'CONFIRM_SIGN_IN_WITH_EMAIL_CODE',
      'CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE',
    ].includes(step);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = step
        ? await confirmSignIn({ challengeResponse: challenge })
        : await signIn({ username: email.trim(), password });
      setPassword('');
      setChallenge('');
      if (result.isSignedIn) await onAuthenticated();
      else setStep(result.nextStep.signInStep);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Sign in failed. Please try again.',
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Brand />
        <div className="eyebrow">DEVELOPER WORKSPACE</div>
        <h1>
          From feedback
          <br />
          to a reviewed plan.
        </h1>
        <p>
          Sign in with your existing Warehouse account to review proposals and
          decide what gets built.
        </p>
        <form onSubmit={submit}>
          {!step ? (
            <>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={busy}
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={busy}
              />
            </>
          ) : supported ? (
            <>
              <label htmlFor="challenge">
                {newPassword ? 'Choose a new password' : 'Verification code'}
              </label>
              <input
                id="challenge"
                type={newPassword ? 'password' : 'text'}
                autoComplete={newPassword ? 'new-password' : 'one-time-code'}
                value={challenge}
                onChange={(e) => setChallenge(e.target.value)}
                required
                disabled={busy}
              />
            </>
          ) : (
            <p role="alert">
              Your account requires additional sign-in setup. Complete it in
              Warehouse or contact your account administrator, then reload this
              page.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {supported && (
            <button type="submit" disabled={busy}>
              {busy ? 'Signing in…' : step ? 'Continue' : 'Sign in'}
            </button>
          )}
        </form>
        <small>
          Your plan link stays open while you sign in. Developer permission is
          required.
        </small>
      </section>
    </main>
  );
}
