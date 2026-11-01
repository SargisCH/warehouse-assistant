import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fetchAuthSession, signIn } from 'aws-amplify/auth';
import App from './App';
import Workspace, { PlanReview } from './Workspace';
import Markdown from './Markdown';
import { act, request, ApiError } from './api';
import { Conversation } from './types';
import { exportForAI, readRoute } from './plan-export';
jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(),
  signIn: jest.fn(),
  confirmSignIn: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('./api', () => ({
  ...(jest.requireActual('./api') as typeof import('./api')),
  request: jest.fn(),
  act: jest.fn(),
}));
const api = request as jest.Mock;
const action = act as jest.Mock;
const threadId = '11111111-1111-4111-8111-111111111111';
const planId = '22222222-2222-4222-8222-222222222222';
const olderId = '33333333-3333-4333-8333-333333333333';
const thread: Conversation = {
  id: threadId,
  mode: 'FEEDBACK',
  page: '/admin/sales',
  release: 'release-1',
  status: 'NEEDS_REVIEW',
  revision: 2,
  updatedAt: '2026-10-20T00:00:00Z',
  messages: [
    {
      id: 'message',
      kind: 'USER',
      body: 'Add a manager filter',
      createdAt: '2026-10-20T00:00:00Z',
    },
  ],
  plans: [
    {
      id: planId,
      threadId,
      version: 2,
      threadRevision: 2,
      body: '# Outcome\nAdd a sales filter.\n\n## Acceptance criteria\n- Preserve existing filters.',
      sourceRefs: { backend: 'abc123' },
      createdAt: '2026-10-20T00:00:00Z',
    },
    {
      id: olderId,
      threadId,
      version: 1,
      threadRevision: 1,
      body: 'Older proposal',
      sourceRefs: {},
      createdAt: '2026-10-19T00:00:00Z',
    },
  ],
  runs: [],
};
function review(value = thread) {
  return render(
    <PlanReview
      conversation={value}
      navigate={jest.fn()}
      didChange={jest.fn()}
      accessLost={jest.fn()}
    />,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState({}, '', '/');
  (fetchAuthSession as jest.Mock).mockResolvedValue({
    tokens: {
      accessToken: 'token',
      idToken: { payload: { email: 'dev@example.com' } },
    },
  });
  (signIn as jest.Mock).mockResolvedValue({
    isSignedIn: true,
    nextStep: { signInStep: 'DONE' },
  });
  api.mockImplementation((path: string) =>
    Promise.resolve(
      path === 'assistant/access'
        ? { assistantAccess: 'DEVELOPER', aiConfigured: true }
        : path === 'assistant/threads'
        ? []
        : thread,
    ),
  );
  action.mockResolvedValue({});
});

test('non-developers are denied without fetching private plans', async () => {
  api.mockResolvedValue({ assistantAccess: 'CONTRIBUTOR' });
  render(<App configured />);
  expect(await screen.findByText('Developer access required')).toBeTruthy();
  expect(api).toHaveBeenCalledTimes(1);
});

test('account changes reauthenticate before fetching private workspace data', async () => {
  api.mockResolvedValue({
    userId: 'new-account',
    tenantId: 9,
    assistantAccess: 'DEVELOPER',
  });
  const sessionChanged = jest.fn().mockResolvedValue(undefined);
  render(
    <Workspace
      email="old@example.com"
      accountKey="old-account:7"
      logout={jest.fn()}
      accessLost={jest.fn()}
      sessionChanged={sessionChanged}
    />,
  );
  await waitFor(() => expect(sessionChanged).toHaveBeenCalled());
  expect(api).toHaveBeenCalledTimes(1);
  expect(api).toHaveBeenCalledWith('assistant/access', expect.any(Object));
});

test('an email plan link survives sign-in and opens its exact version', async () => {
  window.history.replaceState({}, '', `/plans/${olderId}`);
  (fetchAuthSession as jest.Mock).mockResolvedValueOnce({}).mockResolvedValue({
    tokens: {
      accessToken: 'token',
      idToken: { payload: { email: 'dev@example.com' } },
    },
  });
  api.mockImplementation((path: string) =>
    Promise.resolve(
      path === 'assistant/access'
        ? { assistantAccess: 'DEVELOPER' }
        : path === 'assistant/threads'
        ? []
        : { ...thread, selectedPlanId: olderId },
    ),
  );
  render(<App configured />);
  fireEvent.change(await screen.findByLabelText('Email'), {
    target: { value: 'dev@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'test-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
  expect(await screen.findByText('Older proposal')).toBeTruthy();
  expect(window.location.pathname).toBe(`/plans/${olderId}`);
  expect(api).toHaveBeenCalledWith(
    `assistant/plans/${olderId}`,
    expect.any(Object),
  );
  expect(
    (screen.getByLabelText('Plan version') as HTMLSelectElement).value,
  ).toBe(olderId);
  expect(
    screen
      .getByRole('button', { name: 'Approve & start' })
      .hasAttribute('disabled'),
  ).toBe(true);
});

test('copy sends Markdown and context to the clipboard without approving anything', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  review();
  fireEvent.click(screen.getByRole('button', { name: 'Copy for AI' }));
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('# Outcome'),
    ),
  );
  const copied = writeText.mock.calls[0][0];
  expect(copied).toContain('Add a manager filter');
  expect(copied).toContain('backend: abc123');
  expect(copied).toContain(`Plan ID: ${planId}`);
  expect(copied).toContain('does not authorize implementation');
  expect(action).not.toHaveBeenCalled();
});

test('approval requires a separate explicit confirmation of the current plan', async () => {
  review();
  fireEvent.click(screen.getByRole('button', { name: 'Approve & start' }));
  expect(action).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm & start' }));
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(threadId, 'approve', { planId }),
  );
});

test('stale feedback prevents approval', () => {
  review({ ...thread, revision: 3 });
  expect(
    screen
      .getByRole('button', { name: 'Approve & start' })
      .hasAttribute('disabled'),
  ).toBe(true);
});

test('a failed edit keeps the Markdown draft available', async () => {
  action.mockRejectedValue(
    new ApiError(409, 'The plan changed; reload before editing'),
  );
  review();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Markdown' }));
  fireEvent.change(screen.getByLabelText('Plan Markdown'), {
    target: { value: 'My reviewed edits' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save new version' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(
    (screen.getByLabelText('Plan Markdown') as HTMLTextAreaElement).value,
  ).toBe('My reviewed edits');
});

test('Markdown preview renders text safely without executing HTML or unsafe links', () => {
  const { container } = render(
    <Markdown
      text={
        '# Test\n<img src=x onerror="alert(1)">\n[bad](javascript:alert(1))\n[good](https://example.com)'
      }
    />,
  );
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelectorAll('a')).toHaveLength(1);
  expect(container.querySelector('a')?.getAttribute('href')).toBe(
    'https://example.com',
  );
});

test('routes and exported context keep version and revision explicit', () => {
  expect(readRoute(`/plans/${planId}`)).toEqual({ type: 'plans', id: planId });
  expect(readRoute('//evil.example.com')).toEqual({ type: 'missing' });
  expect(exportForAI(thread, thread.plans[1])).toContain(
    'Plan feedback revision: 1\nCurrent feedback revision: 2',
  );
});
