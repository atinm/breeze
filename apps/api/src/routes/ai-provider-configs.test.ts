import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

const PARTNER_A = '11111111-1111-1111-1111-111111111111';
const PARTNER_B = '22222222-2222-2222-2222-222222222222';

vi.mock('../db', () => ({
  runOutsideDbContext: vi.fn((fn) => fn()),
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../db/schema', () => ({
  aiSessions: {
    id: 'aiSessions.id',
    orgId: 'aiSessions.orgId',
  },
  aiMessages: {
    id: 'aiMessages.id',
    sessionId: 'aiMessages.sessionId',
  },
  aiToolExecutions: {
    id: 'aiToolExecutions.id',
    sessionId: 'aiToolExecutions.sessionId',
  },
  auditLogs: {
    id: 'auditLogs.id',
    orgId: 'auditLogs.orgId',
    action: 'auditLogs.action',
    timestamp: 'auditLogs.timestamp',
    actorType: 'auditLogs.actorType',
    actorEmail: 'auditLogs.actorEmail',
    resourceType: 'auditLogs.resourceType',
    resourceId: 'auditLogs.resourceId',
    result: 'auditLogs.result',
    errorMessage: 'auditLogs.errorMessage',
    details: 'auditLogs.details',
  },
  aiActionPlans: {
    id: 'aiActionPlans.id',
    status: 'aiActionPlans.status',
    approvedBy: 'aiActionPlans.approvedBy',
    approvedAt: 'aiActionPlans.approvedAt',
  },
  aiProviderConfigs: {
    partnerId: 'aiProviderConfigs.partnerId',
    provider: 'aiProviderConfigs.provider',
    enabled: 'aiProviderConfigs.enabled',
    defaultModel: 'aiProviderConfigs.defaultModel',
    allowedModels: 'aiProviderConfigs.allowedModels',
    endpoint: 'aiProviderConfigs.endpoint',
    apiKeyRef: 'aiProviderConfigs.apiKeyRef',
    options: 'aiProviderConfigs.options',
    updatedAt: 'aiProviderConfigs.updatedAt',
  },
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: vi.fn((c: any, next: any) => {
    const scope = c.req.header('x-test-scope') ?? 'partner';
    const partnerId = c.req.header('x-test-partner-id') ?? PARTNER_A;
    c.set('auth', {
      user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      scope,
      partnerId: scope === 'organization' ? null : partnerId,
      orgId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      accessibleOrgIds: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
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
}));

vi.mock('../services/aiCostTracker', () => ({
  getSessionHistory: vi.fn(),
  getUsageSummary: vi.fn(),
  updateBudget: vi.fn(),
}));

vi.mock('../services/streamingSessionManager', () => ({
  streamingSessionManager: {
    getOrCreate: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    tryTransitionToProcessing: vi.fn(),
    interrupt: vi.fn(),
    startTurnTimeout: vi.fn(),
  },
}));

vi.mock('../services/aiAgentSdk', () => ({
  runPreFlightChecks: vi.fn(),
  abortActivePlan: vi.fn(),
}));

vi.mock('../services/auditEvents', () => ({
  writeRouteAudit: vi.fn(),
}));

import { aiRoutes } from './ai';
import { db } from '../db';
import { writeRouteAudit } from '../services/auditEvents';

describe('AI provider config routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/ai', aiRoutes);
  });

  it('GET /provider-configs returns partner configs for partner scope', async () => {
    const mockOrderBy = vi.fn().mockResolvedValue([{
      provider: 'gemini',
      enabled: true,
      defaultModel: 'gemini-2.5-pro',
      updatedAt: new Date(),
    }]);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const res = await app.request('/ai/provider-configs', {
      headers: { Authorization: 'Bearer token', 'x-test-scope': 'partner', 'x-test-partner-id': PARTNER_A },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(mockWhere).toHaveBeenCalled();
  });

  it('GET /provider-configs rejects partner scope for other partnerId', async () => {
    const res = await app.request(`/ai/provider-configs?partnerId=${PARTNER_B}`, {
      headers: { Authorization: 'Bearer token', 'x-test-scope': 'partner', 'x-test-partner-id': PARTNER_A },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Access denied');
  });

  it('GET /provider-configs requires partnerId for system scope', async () => {
    const res = await app.request('/ai/provider-configs', {
      headers: { Authorization: 'Bearer token', 'x-test-scope': 'system' },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('partnerId query parameter is required');
  });

  it('PUT /provider-configs/:provider upserts config for system scope', async () => {
    const mockSelectLimit = vi.fn().mockResolvedValue([]);
    const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
    const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
    vi.mocked(db.select).mockReturnValue({ from: mockSelectFrom } as any);

    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict });
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const res = await app.request(`/ai/provider-configs/gemini?partnerId=${PARTNER_A}`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json', 'x-test-scope': 'system' },
      body: JSON.stringify({
        enabled: true,
        defaultModel: 'gemini-2.5-pro',
        allowedModels: ['gemini-2.5-pro'],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockOnConflict).toHaveBeenCalled();
    expect(writeRouteAudit).toHaveBeenCalled();
  });

  it('DELETE /provider-configs/:provider returns 404 when config does not exist', async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    vi.mocked(db.delete).mockReturnValue({ where: mockWhere } as any);

    const res = await app.request('/ai/provider-configs/gemini', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token', 'x-test-scope': 'partner', 'x-test-partner-id': PARTNER_A },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Provider config not found');
  });
});
