export type Thread = {
  id: string;
  project?: 'warehouse' | 'finit';
  mode: 'QUESTION' | 'FEEDBACK';
  page: string;
  release: string;
  status: string;
  revision: number;
  updatedAt: string;
  preview?: string;
};
export type Plan = {
  id: string;
  threadId: string;
  version: number;
  threadRevision: number;
  body: string;
  sourceRefs: Record<string, string>;
  createdAt: string;
};
export type Conversation = Thread & {
  selectedPlanId?: string;
  messages: {
    id: string;
    kind: string;
    body: string;
    authorId?: string;
    createdAt: string;
  }[];
  plans: Plan[];
  runs: {
    id: string;
    kind: string;
    status: string;
    planId?: string;
    error?: string;
    result?: { summary?: string; pullRequests?: string[] };
  }[];
};
export type Access = {
  userId: string;
  tenantId: number | null;
  assistantAccess: 'NONE' | 'CONTRIBUTOR' | 'DEVELOPER';
  aiConfigured: boolean;
};
export type Route =
  | { type: 'inbox' }
  | { type: 'plans' | 'threads'; id: string }
  | { type: 'missing' };
