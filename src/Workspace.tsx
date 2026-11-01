import React, { useCallback, useEffect, useState } from 'react';
import { act, ApiError, request } from './api';
import { Brand } from './App';
import Markdown from './Markdown';
import { copyText, exportForAI, readRoute } from './plan-export';
import { Access, Conversation, Plan, Thread } from './types';
const label = (value: string) => value.toLowerCase().replace(/_/g, ' ');
export default function Workspace({
  email,
  logout,
  accessLost,
  accountKey,
  sessionChanged,
}: {
  email: string;
  logout: () => Promise<void>;
  accessLost: () => void;
  accountKey: string;
  sessionChanged: () => Promise<void>;
}) {
  const [path, setPath] = useState(window.location.pathname);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [detail, setDetail] = useState<Conversation>();
  const [filter, setFilter] = useState('REVIEW');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const route = readRoute(path);
  const navigate = (next: string) => {
    window.history.pushState(null, '', next);
    setPath(next);
  };
  useEffect(() => {
    const back = () => setPath(window.location.pathname);
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  // Only clear on actual route changes, not poll refreshes or ordinary actions.
  useEffect(() => {
    setDetail(undefined);
    setError('');
    setLoading(true);
  }, [path]);
  useEffect(() => {
    let live = true;
    let inFlight = false;
    const abort = new AbortController();
    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const access = await request<Access>('assistant/access', {
          signal: abort.signal,
        });
        if (!live) return;
        if (access.assistantAccess !== 'DEVELOPER') {
          setDetail(undefined);
          setThreads([]);
          accessLost();
          return;
        }
        if (`${access.userId}:${access.tenantId}` !== accountKey) {
          setDetail(undefined);
          setThreads([]);
          await sessionChanged();
          return;
        }
        const [list, selected] = await Promise.all([
          request<Thread[]>('assistant/threads', { signal: abort.signal }),
          route.type === 'plans' || route.type === 'threads'
            ? request<Conversation>(`assistant/${route.type}/${route.id}`, {
                signal: abort.signal,
              })
            : Promise.resolve(undefined),
        ]);
        if (live) {
          setThreads(list);
          setDetail(selected);
          setError('');
        }
      } catch (e) {
        if (!live) return;
        if (e instanceof ApiError && [401, 403].includes(e.status)) {
          setDetail(undefined);
          setThreads([]);
          accessLost();
        } else
          setError(
            e instanceof Error ? e.message : 'Could not load the review inbox.',
          );
      } finally {
        if (live) setLoading(false);
        inFlight = false;
      }
    }
    load();
    const interval = window.setInterval(load, 10000);
    return () => {
      live = false;
      abort.abort();
      window.clearInterval(interval);
    };
    // The route comes entirely from path. Keep polling independent of render identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, refresh, accountKey]);
  const visible = threads.filter(
    (t) =>
      (!search ||
        `${t.preview} ${t.page}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (filter === 'ALL' ||
        (filter === 'REVIEW' &&
          t.mode === 'FEEDBACK' &&
          ['OPEN', 'NEEDS_REVIEW'].includes(t.status)) ||
        (filter === 'PROGRESS' &&
          ['IN_PROGRESS', 'CODE_REVIEW'].includes(t.status)) ||
        t.status === filter),
  );
  const didChange = useCallback(() => setRefresh((n) => n + 1), []);
  return (
    <div className="workspace">
      <header className="topbar">
        <Brand />
        <div className="account">
          <span>{email}</span>
          <button className="quiet" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <div className="workspace-body">
        <aside className="inbox">
          <div className="inbox-heading">
            <h1>Review inbox</h1>
            <span className="count">{threads.length}</span>
          </div>
          <p className="muted">You decide what gets built.</p>
          <label className="sr-only" htmlFor="search">
            Search feedback
          </label>
          <input
            id="search"
            placeholder="Search feedback or page…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="sr-only" htmlFor="filter">
            Filter inbox
          </label>
          <select
            id="filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="REVIEW">Needs review</option>
            <option value="ALL">All conversations</option>
            <option value="PROGRESS">In progress</option>
            <option value="READY_TO_TEST">Ready to test</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DEFERRED">Deferred</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
          <nav aria-label="Feedback conversations">
            {visible.map((t) => (
              <button
                key={t.id}
                className={`thread-card ${
                  detail?.id === t.id ? 'selected' : ''
                }`}
                onClick={() => navigate(`/threads/${t.id}`)}
              >
                <span
                  className={`status ${
                    t.status === 'NEEDS_REVIEW' ? 'review' : ''
                  }`}
                >
                  {label(t.status)}
                </span>
                <strong>{t.preview || 'Conversation'}</strong>
                <small>{t.page}</small>
                <small>{new Date(t.updatedAt).toLocaleDateString()}</small>
              </button>
            ))}
          </nav>
          {!loading && !visible.length && (
            <p className="muted">No conversations in this view.</p>
          )}
          <button className="quiet" onClick={() => navigate('/')}>
            Inbox overview
          </button>
        </aside>
        <main className="review-main">
          {error && (
            <div role="alert" className="banner error">
              {error}
              <button className="quiet" onClick={didChange}>
                Retry
              </button>
            </div>
          )}
          {route.type === 'missing' ? (
            <div className="empty">
              <h1>Page not found</h1>
              <button onClick={() => navigate('/')}>Open inbox</button>
            </div>
          ) : detail ? (
            <PlanReview
              key={detail.id}
              conversation={detail}
              navigate={navigate}
              didChange={didChange}
              accessLost={accessLost}
            />
          ) : loading ? (
            <p role="status">Loading your review workspace…</p>
          ) : route.type === 'inbox' ? (
            <div className="empty">
              <div className="eyebrow">FEEDBACK → PLAN → YOUR APPROVAL</div>
              <h1>
                A clear view of
                <br />
                what comes next.
              </h1>
              <p>
                Select a conversation to review the feedback, read the proposal,
                or copy a plan into your AI chat.
              </p>
              <div className="summary-grid">
                <div>
                  <strong>
                    {threads.filter((t) => t.status === 'NEEDS_REVIEW').length}
                  </strong>
                  <span>Plans to review</span>
                </div>
                <div>
                  <strong>
                    {
                      threads.filter((t) =>
                        ['IN_PROGRESS', 'CODE_REVIEW'].includes(t.status),
                      ).length
                    }
                  </strong>
                  <span>In progress</span>
                </div>
                <div>
                  <strong>
                    {threads.filter((t) => t.status === 'READY_TO_TEST').length}
                  </strong>
                  <span>Ready to test</span>
                </div>
              </div>
            </div>
          ) : (
            !error && <p>Conversation unavailable.</p>
          )}
        </main>
      </div>
    </div>
  );
}
export function PlanReview({
  conversation: thread,
  navigate,
  didChange,
  accessLost,
}: {
  conversation: Conversation;
  navigate: (path: string) => void;
  didChange: () => void;
  accessLost: () => void;
}) {
  const latest = thread.plans[0];
  const plan =
    thread.plans.find((p) => p.id === thread.selectedPlanId) || latest;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingBase, setEditingBase] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<string>();
  const running = thread.runs.some((r) =>
    ['QUEUED', 'RUNNING'].includes(r.status),
  );
  const uncancellable = thread.runs.some(
    (r) =>
      r.status === 'RUNNING' ||
      (r.kind === 'IMPLEMENT' && r.status === 'QUEUED'),
  );
  const stale = !!plan && plan.threadRevision !== thread.revision;
  const current = !!plan && plan.id === latest?.id;
  const canApprove =
    !!plan &&
    current &&
    !stale &&
    !running &&
    !editing &&
    thread.status === 'NEEDS_REVIEW' &&
    !thread.runs.some((r) => r.kind === 'IMPLEMENT' && r.planId === plan.id);
  useEffect(() => {
    setConfirm(undefined);
    setNotice('');
    setError('');
  }, [plan?.id]);
  async function perform(action: string, body?: unknown) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await act<Plan>(thread.id, action, body);
      if (action === 'messages') setReply('');
      if (action === 'plans') {
        setEditing(false);
        navigate(`/plans/${result.id}`);
      }
      setConfirm(undefined);
      setNotice(
        action === 'approve'
          ? 'Approved plan queued for implementation. You will review the resulting PRs before release.'
          : 'Saved.',
      );
      didChange();
    } catch (e) {
      if (e instanceof ApiError && [401, 403].includes(e.status)) accessLost();
      else
        setError(
          e instanceof Error
            ? e.message
            : 'Could not save. Your draft is still here.',
        );
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!plan) return;
    try {
      await copyText(exportForAI(thread, plan));
      setNotice('Copied. Paste the Markdown directly into your AI chat.');
    } catch {
      setError(
        'Clipboard access failed. Open Edit plan to select and copy the Markdown manually.',
      );
    }
  }
  const warehouse = process.env.REACT_APP_WAREHOUSE_URL;
  let pageUrl: string | undefined;
  try {
    if (
      warehouse &&
      thread.page.startsWith('/') &&
      !thread.page.startsWith('//')
    ) {
      const url = new URL(thread.page, warehouse);
      if (['http:', 'https:'].includes(url.protocol)) pageUrl = url.toString();
    }
  } catch {
    /* optional app link */
  }
  return (
    <article>
      <div className="eyebrow">
        {thread.mode === 'FEEDBACK'
          ? 'IMPLEMENTATION PROPOSAL'
          : 'QUESTION & DISCUSSION'}
      </div>
      <div className="review-heading">
        <div>
          <h1>
            {thread.mode === 'FEEDBACK'
              ? 'Review the plan'
              : 'Review the conversation'}
          </h1>
          <p className="muted">
            {pageUrl ? (
              <a href={pageUrl} target="_blank" rel="noreferrer">
                {thread.page} ↗
              </a>
            ) : (
              thread.page
            )}{' '}
            · Release {thread.release}
          </p>
        </div>
        <span className="status review">{label(thread.status)}</span>
      </div>
      {notice && (
        <div className="banner success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      <section className="card">
        <h2>Original feedback & discussion</h2>
        <div className="conversation">
          {thread.messages.map((m) => (
            <div key={m.id} className="message">
              <small>
                {m.kind === 'AI'
                  ? 'AI assistant'
                  : m.kind === 'SYSTEM'
                  ? 'Update'
                  : 'Reviewer'}{' '}
                · {new Date(m.createdAt).toLocaleString()}
              </small>
              <p>{m.body}</p>
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim()) perform('messages', { body: reply.trim() });
          }}
        >
          <label htmlFor="reply">Reply or ask for clarification</label>
          <textarea
            id="reply"
            value={reply}
            maxLength={8000}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
          />
          <div className="actions">
            <button className="secondary" disabled={busy || !reply.trim()}>
              Send reply
            </button>
          </div>
        </form>
      </section>
      {plan && (
        <section className="card plan-card">
          <div className="plan-toolbar">
            <h2>Proposed plan</h2>
            <div className="actions">
              <label className="sr-only" htmlFor="version">
                Plan version
              </label>
              <select
                id="version"
                value={plan.id}
                disabled={editing || busy}
                onChange={(e) => navigate(`/plans/${e.target.value}`)}
              >
                {thread.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    Version {p.version}
                    {p.id === latest?.id ? ' · latest' : ''}
                  </option>
                ))}
              </select>
              <button className="secondary" onClick={copy}>
                Copy for AI
              </button>
            </div>
          </div>
          {!current && (
            <div className="banner">
              You are viewing an older plan.{' '}
              <button
                className="quiet"
                onClick={() => navigate(`/plans/${latest.id}`)}
              >
                Open latest version
              </button>
            </div>
          )}
          {stale && (
            <div className="banner">
              Feedback changed after this plan was created. Regenerate it before
              approval.
            </div>
          )}
          {editing ? (
            <>
              <label htmlFor="plan-draft">Plan Markdown</label>
              <textarea
                id="plan-draft"
                className="plan-editor"
                value={draft}
                maxLength={40000}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="actions">
                <button
                  disabled={busy || !draft.trim()}
                  onClick={() =>
                    perform('plans', { basePlanId: editingBase, body: draft })
                  }
                >
                  Save new version
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  Cancel edit
                </button>
              </div>
            </>
          ) : (
            <>
              <Markdown text={plan.body} />
              <div className="actions">
                <button
                  className="secondary"
                  disabled={busy || !current || running || stale}
                  onClick={() => {
                    setEditingBase(plan.id);
                    setDraft(plan.body);
                    setEditing(true);
                  }}
                >
                  Edit Markdown
                </button>
              </div>
            </>
          )}
          <details>
            <summary>Source references</summary>
            <ul>
              {Object.entries(plan.sourceRefs).map(([repo, sha]) => (
                <li key={repo}>
                  {repo}: <code>{sha}</code>
                </li>
              ))}
            </ul>
            <small>
              Plan {plan.id} · Version {plan.version}
            </small>
          </details>
          <div className="approval-box">
            <div>
              <h3>Your approval starts coding</h3>
              <p>
                Opening, copying, or editing this plan does not authorize
                implementation. Merging and deployment require a separate
                review.
              </p>
            </div>
            {confirm ? (
              <div role="group" aria-label="Confirm implementation">
                <p>Start implementation of plan version {plan.version}?</p>
                <div className="actions">
                  <button
                    disabled={busy || !canApprove || confirm !== plan.id}
                    onClick={() => perform('approve', { planId: confirm })}
                  >
                    Confirm & start
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setConfirm(undefined)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                disabled={busy || !canApprove}
                onClick={() => setConfirm(plan.id)}
              >
                Approve & start
              </button>
            )}
          </div>
        </section>
      )}
      {!plan && thread.mode === 'FEEDBACK' && (
        <section className="card">
          <h2>Waiting for a proposal</h2>
          <p>
            {running
              ? 'Plan generation is queued or processing. If Gemini is not configured, the job remains saved.'
              : 'Generate a plan to review the proposed implementation.'}
          </p>
        </section>
      )}
      <section className="card">
        <h2>Review actions</h2>
        <div className="actions">
          <button
            className="secondary"
            disabled={busy || running || editing}
            onClick={() => perform('plan')}
          >
            {thread.mode === 'QUESTION'
              ? 'Retry answer'
              : plan
              ? 'Regenerate plan'
              : 'Generate plan'}
          </button>
          <button
            className="quiet"
            disabled={busy || uncancellable}
            onClick={() => perform('status', { status: 'DEFERRED' })}
          >
            Defer
          </button>
          <button
            className="quiet danger"
            disabled={busy || uncancellable}
            onClick={() => perform('status', { status: 'DISMISSED' })}
          >
            Dismiss
          </button>
          {thread.status === 'CODE_REVIEW' && (
            <button
              disabled={busy || running}
              onClick={() => {
                if (
                  window.confirm(
                    'Have you reviewed, merged and deployed the implementation?',
                  )
                )
                  perform('status', { status: 'READY_TO_TEST' });
              }}
            >
              Deployed—ready to test
            </button>
          )}
        </div>
      </section>
      {!!thread.runs.length && (
        <section className="card">
          <h2>Activity & implementation</h2>
          {thread.runs.map((run) => (
            <div className="run" key={run.id}>
              <strong>
                {label(run.kind)} · {label(run.status)}
              </strong>
              {run.error && <p className="error">{run.error}</p>}
              {run.result?.summary && <p>{run.result.summary}</p>}
              {run.result?.pullRequests
                ?.filter((url) =>
                  /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(
                    url,
                  ),
                )
                .map((url) => (
                  <p key={url}>
                    <a href={url} target="_blank" rel="noreferrer">
                      Review draft PR ↗
                    </a>
                  </p>
                ))}
            </div>
          ))}
        </section>
      )}
    </article>
  );
}
