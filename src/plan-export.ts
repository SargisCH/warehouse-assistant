import { Conversation, Plan, Route } from './types';
export function readRoute(path: string): Route {
  if (path === '/') return { type: 'inbox' };
  const match =
    /^\/(plans|threads)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i.exec(
      path,
    );
  return match
    ? { type: match[1] as 'plans' | 'threads', id: match[2] }
    : { type: 'missing' };
}
export function exportForAI(thread: Conversation, plan: Plan) {
  const feedback = thread.messages
    .filter((m) => m.kind !== 'SYSTEM')
    .map((m) => `${m.kind === 'AI' ? 'AI' : 'Reviewer'}: ${m.body}`)
    .join('\n\n');
  return `Please review the following implementation plan. Identify gaps, risks, and improvements. This is a review request; copying this plan does not authorize implementation.\n\n# Warehouse implementation plan\n\nPlan ID: ${
    plan.id
  }\nVersion: ${plan.version}\nPage: ${thread.page}\nRelease: ${
    thread.release
  }\nPlan feedback revision: ${
    plan.threadRevision
  }\nCurrent feedback revision: ${
    thread.revision
  }\n\n## Repository commits\n\n${
    Object.entries(plan.sourceRefs)
      .map(([repo, sha]) => `- ${repo}: ${sha}`)
      .join('\n') || 'Not recorded'
  }\n\n## Conversation context (current; may include messages added after this plan)\n\n${feedback}\n\n## Proposed plan\n\n${
    plan.body
  }\n`;
}
export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const element = document.createElement('textarea');
  element.value = text;
  element.style.position = 'fixed';
  element.style.opacity = '0';
  document.body.appendChild(element);
  element.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
  } finally {
    element.remove();
  }
}
