import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { partnersRoutes } from './partners';

vi.mock('../services', () => ({}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([]))
        }))
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([]))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([]))
        }))
      }))
    }))
  },
  runOutsideDbContext: vi.fn((fn: () => any) => fn()),
  withSystemDbAccessContext: vi.fn(async (fn: () => any) => fn())
}));

vi.mock('../db/schema', () => ({
  partners: {},
  organizations: {}
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: vi.fn((c: any, next: any) => {
    c.set('auth', {
      user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
      token: {},
      partnerId: 'partner-123',
      orgId: 'org-123',
      scope: 'system',
      accessibleOrgIds: null,
      orgCondition: () => undefined,
      canAccessOrg: () => true
    } as any);
    return next();
  }),
  requireScope: vi.fn(() => (c: any, next: any) => next()),
  requirePartner: vi.fn((c: any, next: any) => next())
}));

import { db } from '../db';
import { authMiddleware } from '../middleware/auth';

describe('partners routes', () => {
  let app: Hono;

  const setAuthContext = (overrides: Partial<{
    partnerId: string | null;
    orgId: string | null;
    scope: 'system' | 'partner' | 'organization';
  }> = {}) => {
    vi.mocked(authMiddleware).mockImplementation((c: any, next: any) => {
      c.set('auth', {
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
        token: {},
        partnerId: 'partnerId' in overrides ? overrides.partnerId : 'partner-123',
        orgId: 'orgId' in overrides ? overrides.orgId : 'org-123',
        scope: overrides.scope ?? 'system',
        accessibleOrgIds: null,
        orgCondition: () => undefined,
        canAccessOrg: () => true
      } as any);
      return next();
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setAuthContext();
    app = new Hono();
    app.route('/partners', partnersRoutes);
  });

  it('GET /partners returns paginated partner list', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }])
        })
      } as any)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue([{ id: 'partner-1', name: 'P1' }])
              })
            })
          })
        })
      } as any);

    const res = await app.request('/partners?page=1&limit=50');
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data).toHaveLength(1);
    expect(json.pagination.total).toBe(1);
  });

  it('GET /partners/me returns partner for partner-scoped user', async () => {
    setAuthContext({ scope: 'partner', partnerId: 'partner-9' });
    app = new Hono();
    app.route('/partners', partnersRoutes);

    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'partner-9', name: 'Partner Nine' }])
        })
      })
    } as any);

    const res = await app.request('/partners/me');
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.id).toBe('partner-9');
  });
});
