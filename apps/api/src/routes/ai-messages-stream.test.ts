import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { AsyncEventQueue } from '../utils/asyncQueue';

vi.mock('../db', () => ({
  runOutsideDbContext: vi.fn((fn) => fn()),
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../db/schema', () => ({
  aiSessions: {
    id: 'aiSessions.id',
  },
  aiMessages: {
    id: 'aiMessages.id',
    sessionId: 'aiMessages.sessionId',
  },
  aiToolExecutions: {
    id: 'aiToolExecutions.id',
  },
  auditLogs: {
    id: 'auditLogs.id',
  },
  aiActionPlans: {
    id: 'aiActionPlans.id',
  },
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: vi.fn((c: any, next: any) => {
    c.set('auth', {
      user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      scope: 'organization',
      partnerId: null,
      orgId: '11111111-1111-1111-1111-111111111111',
      accessibleOrgIds: ['11111111-1111-1111-1111-111111111111'],
      orgCondition: () => undefined,
      canAccessOrg: () => true,
    });
    return next();
  }),
  requireScope: vi.fn(() => async (_c: any, next: any) => next()),
}));

vi.mock('../services/aiAgent', () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  listSessions: vi.fn(),
  closeSession: vi.fn(),
  getSessionMessages: vi.fn(),
  handleApproval: vi.fn(),
  searchSessions: vi.fn(),
  generateSessionTitle: vi.fn(() => 'Test title'),
}));

vi.mock('../services/aiCostTracker', () => ({
  getSessionHistory: vi.fn(),
  getUsageSummary: vi.fn(),
  updateBudget: vi.fn(),
}));

vi.mock('../services/auditEvents', () => ({
  writeRouteAudit: vi.fn(),
}));

const { mockStreamingSessionManager, mockRunPreFlightChecks } = vi.hoisted(() => ({
  mockStreamingSessionManager: {
    getOrCreate: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    tryTransitionToProcessing: vi.fn(),
    interrupt: vi.fn(),
    startTurnTimeout: vi.fn(),
  },
  mockRunPreFlightChecks: vi.fn(),
}));

vi.mock('../services/streamingSessionManager', () => ({
  streamingSessionManager: mockStreamingSessionManager,
}));

vi.mock('../services/aiAgentSdk', () => ({
  runPreFlightChecks: (...args: unknown[]) => mockRunPreFlightChecks(...args),
  abortActivePlan: vi.fn(),
}));

import { aiRoutes } from './ai';
import { db } from '../db';
import { getSession } from '../services/aiAgent';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';

describe('AI message streaming route', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/ai', aiRoutes);
  });

  it('delivers fast error events that occur immediately after pushMessage', async () => {
    vi.mocked(getSession).mockResolvedValue({
      id: SESSION_ID,
      orgId: '11111111-1111-1111-1111-111111111111',
      title: 'Existing conversation',
      turnCount: 0,
      systemPrompt: 'existing system prompt',
    } as any);

    mockRunPreFlightChecks.mockResolvedValue({
      ok: true,
      session: {
        id: SESSION_ID,
        orgId: '11111111-1111-1111-1111-111111111111',
        title: 'Existing conversation',
        turnCount: 0,
        systemPrompt: 'existing system prompt',
      },
      sanitizedContent: 'hello',
      systemPrompt: 'system prompt',
      maxBudgetUsd: undefined,
      provider: 'gemini',
      providerModel: 'gemini-2.5-pro',
    });

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as any);

    const subscribers = new Map<string, AsyncEventQueue<any>>();
    const eventBus = {
      subscribe: vi.fn((id: string) => {
        const queue = new AsyncEventQueue<any>();
        subscribers.set(id, queue);
        return queue;
      }),
      unsubscribe: vi.fn((id: string) => {
        subscribers.get(id)?.close();
        subscribers.delete(id);
      }),
      publish: vi.fn((event: any) => {
        for (const queue of subscribers.values()) {
          queue.push(event);
        }
      }),
    };

    const activeSession = {
      state: 'idle',
      eventBus,
      inputController: {
        pushMessage: vi.fn(() => {
          eventBus.publish({ type: 'error', message: 'Quota exceeded for model: gemini-2.5-pro. Please retry in 39s.' });
          eventBus.publish({ type: 'done' });
        }),
      },
    };

    mockStreamingSessionManager.getOrCreate.mockResolvedValue(activeSession as any);
    mockStreamingSessionManager.tryTransitionToProcessing.mockReturnValue(true);

    const res = await app.request(`/ai/sessions/${SESSION_ID}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ content: 'hello' }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"type":"error"');
    expect(text).toContain('Quota exceeded for model: gemini-2.5-pro. Please retry in 39s.');
    expect(eventBus.subscribe.mock.invocationCallOrder[0]!).toBeLessThan(
      activeSession.inputController.pushMessage.mock.invocationCallOrder[0]!
    );
  });
});
