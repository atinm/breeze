import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { userRoutes } from './users';

const { sendInviteMock } = vi.hoisted(() => ({
  sendInviteMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../services/permissions', () => ({
  PERMISSIONS: {
    USERS_READ: { resource: 'users', action: 'read' },
    USERS_INVITE: { resource: 'users', action: 'invite' },
    USERS_WRITE: { resource: 'users', action: 'write' },
    USERS_DELETE: { resource: 'users', action: 'delete' }
  }
}));

vi.mock('../db', () => ({
  runOutsideDbContext: vi.fn((fn) => fn()),
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
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([]))
      }))
    })),
    transaction: vi.fn()
  }
}));

vi.mock('../db/schema', () => ({
  users: {},
  partnerUsers: {},
  organizationUsers: {},
  roles: {},
  organizations: {},
  sessions: {}
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: vi.fn((c: any, next: any) => {
    c.set('auth', {
      scope: 'partner',
      partnerId: 'partner-123',
      orgId: null,
      canAccessOrg: () => true,
      user: { id: 'user-123', email: 'test@example.com' }
    });
    return next();
  }),
  requireScope: vi.fn(() => async (_c: any, next: any) => next()),
  requirePermission: vi.fn(() => (c: any, next: any) => next())
}));

vi.mock('../services/email', () => ({
  getEmailService: vi.fn(() => ({
    sendInvite: sendInviteMock
  }))
}));

import { db } from '../db';
import { authMiddleware } from '../middleware/auth';

describe('user routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authMiddleware).mockImplementation((c: any, next: any) => {
      c.set('auth', {
        scope: 'partner',
        partnerId: 'partner-123',
        orgId: null,
        canAccessOrg: () => true,
        user: { id: 'user-123', email: 'test@example.com' }
      });
      return next();
    });
    app = new Hono();
    app.route('/users', userRoutes);
  });

  describe('GET /users', () => {
    it('should list partner users', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                {
                  id: '11111111-1111-1111-1111-111111111111',
                  email: 'user@example.com',
                  name: 'Partner User',
                  status: 'active',
                  roleId: 'role-1',
                  roleName: 'Admin',
                  orgAccess: 'all',
                  orgIds: null
                }
              ])
            })
          })
        })
      } as any);

      const res = await app.request('/users', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer token'
        }
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].email).toBe('user@example.com');
    });

    it('should allow system scope with no tenant context', async () => {
      vi.mocked(authMiddleware).mockImplementation((c: any, next: any) => {
        c.set('auth', {
          scope: 'system',
          partnerId: null,
          orgId: null,
          canAccessOrg: () => true,
          user: { id: 'user-123', email: 'test@example.com' }
        });
        return next();
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                {
                  id: '11111111-1111-1111-1111-111111111111',
                  email: 'sysadmin@breeze.local',
                  name: 'Breeze System Admin',
                  status: 'active',
                  lastLoginAt: null,
                }
              ])
            })
          })
        })
      } as any);

      const res = await app.request('/users', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer token'
        }
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data[0].email).toBe('sysadmin@breeze.local');
    });

    it('should allow system scope when orgId query is provided', async () => {
      vi.mocked(authMiddleware).mockImplementation((c: any, next: any) => {
        c.set('auth', {
          scope: 'system',
          partnerId: null,
          orgId: null,
          canAccessOrg: () => true,
          user: { id: 'user-123', email: 'test@example.com' }
        });
        return next();
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                {
                  id: '11111111-1111-1111-1111-111111111111',
                  email: 'orguser@example.com',
                  name: 'Org User',
                  status: 'active',
                  roleId: 'role-1',
                  roleName: 'Org Admin',
                  siteIds: [],
                  deviceGroupIds: []
                }
              ])
            })
          })
        })
      } as any);

      const res = await app.request('/users?orgId=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer token'
        }
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data[0].email).toBe('orguser@example.com');
    });

    it('should allow system scope when partnerId query is provided', async () => {
      vi.mocked(authMiddleware).mockImplementation((c: any, next: any) => {
        c.set('auth', {
          scope: 'system',
          partnerId: null,
          orgId: null,
          canAccessOrg: () => true,
          user: { id: 'user-123', email: 'test@example.com' }
        });
        return next();
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                {
                  id: '11111111-1111-1111-1111-111111111111',
                  email: 'partneruser@example.com',
                  name: 'Partner User',
                  status: 'active',
                  roleId: 'role-1',
                  roleName: 'Partner Admin',
                  orgAccess: 'all',
                  orgIds: []
                }
              ])
            })
          })
        })
      } as any);

      const res = await app.request('/users?partnerId=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer token'
        }
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data[0].email).toBe('partneruser@example.com');
    });

  });

  describe('POST /users/invite', () => {
    it('should invite a partner user with selected orgs', async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: '22222222-2222-2222-2222-222222222222',
                scope: 'partner',
                name: 'Admin',
                description: null,
                isSystem: true,
                partnerId: null,
                orgId: null
              }
            ])
          })
        })
      } as any);

      const txSelect = vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([])
            })
          })
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([])
            })
          })
        });

      const txInsert = vi
        .fn()
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: '11111111-1111-1111-1111-111111111111',
                email: 'invitee@example.com',
                name: 'Invitee',
                status: 'invited'
              }
            ])
          })
        })
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'link-1' }])
          })
        });

      vi.mocked(db.transaction).mockImplementation(async (fn) => {
        return fn({ select: txSelect, insert: txInsert } as any);
      });

      const res = await app.request('/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invitee@example.com',
          name: 'Invitee',
          roleId: '22222222-2222-2222-2222-222222222222',
          orgAccess: 'selected',
          orgIds: ['33333333-3333-3333-3333-333333333333']
        })
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.email).toBe('invitee@example.com');
      expect(body.status).toBe('invited');
    });

    it('should require orgIds when orgAccess is selected', async () => {
      const res = await app.request('/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invitee@example.com',
          name: 'Invitee',
          roleId: '22222222-2222-2222-2222-222222222222',
          orgAccess: 'selected'
        })
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('orgIds');
    });

    it('should invite a system-scope admin when called by a system admin', async () => {
      vi.mocked(authMiddleware).mockImplementation((c: any, next: any) => {
        c.set('auth', {
          scope: 'system',
          partnerId: null,
          orgId: null,
          canAccessOrg: () => true,
          user: { id: 'system-user-1', email: 'sysadmin@breeze.local' }
        });
        return next();
      });

      const txSelect = vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([])
            })
          })
        });

      const txInsert = vi.fn().mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'system-user-2',
              email: 'new-sysadmin@example.com',
              name: 'New System Admin',
              status: 'invited'
            }
          ])
        })
      });

      vi.mocked(db.transaction).mockImplementation(async (fn) => {
        return fn({ select: txSelect, insert: txInsert } as any);
      });

      const res = await app.request('/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'new-sysadmin@example.com',
          name: 'New System Admin',
          roleId: 'system-admin'
        })
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.email).toBe('new-sysadmin@example.com');
      expect(body.status).toBe('invited');
    });
  });

  describe('POST /users/resend-invite', () => {
    it('should resend an invite for invited users', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: '11111111-1111-1111-1111-111111111111',
                    email: 'invitee@example.com',
                    name: 'Invitee',
                    status: 'invited',
                    roleId: 'role-1',
                    roleName: 'Admin',
                    orgAccess: 'all',
                    orgIds: null
                  }
                ])
              })
            })
          })
        })
      } as any);

      const res = await app.request('/users/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: '11111111-1111-1111-1111-111111111111'
        })
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('POST /users/:id/role', () => {
    it('should assign a partner role', async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: '44444444-4444-4444-4444-444444444444',
                scope: 'partner',
                name: 'Operator',
                description: null,
                isSystem: false,
                partnerId: 'partner-123',
                orgId: null
              }
            ])
          })
        })
      } as any);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'link-1' }])
          })
        })
      } as any);

      const res = await app.request('/users/11111111-1111-1111-1111-111111111111/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleId: '44444444-4444-4444-4444-444444444444'
        })
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('DELETE /users/:id', () => {
    it('should delete a system-scope admin when called by another system admin', async () => {
      vi.mocked(authMiddleware).mockImplementation((c: any, next: any) => {
        c.set('auth', {
          scope: 'system',
          partnerId: null,
          orgId: null,
          canAccessOrg: () => true,
          user: { id: 'system-user-1', email: 'sysadmin@breeze.local' }
        });
        return next();
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: 'system-user-2',
                    email: 'other-sysadmin@example.com',
                    name: 'Other System Admin',
                    status: 'active',
                    roleId: 'system-admin',
                    roleName: 'System Admin'
                  }
                ])
              })
            })
          })
        })
      } as any);

      const deleteWhere = vi
        .fn()
        .mockReturnValueOnce(Promise.resolve([]))
        .mockReturnValueOnce({
          returning: vi.fn().mockResolvedValue([{ id: 'system-user-2' }])
        });

      vi.mocked(db.delete).mockReturnValue({
        where: deleteWhere
      } as any);

      const res = await app.request('/users/system-user-2', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer token' }
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should reject self-deletion for system-scope admins', async () => {
      vi.mocked(authMiddleware).mockImplementation((c: any, next: any) => {
        c.set('auth', {
          scope: 'system',
          partnerId: null,
          orgId: null,
          canAccessOrg: () => true,
          user: { id: 'system-user-1', email: 'sysadmin@breeze.local' }
        });
        return next();
      });

      const res = await app.request('/users/system-user-1', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer token' }
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('cannot remove your own');
    });
  });
});
