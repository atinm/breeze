import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { partners, organizations } from '../db/schema';
import { authMiddleware, requireScope, requirePartner } from '../middleware/auth';
import { writeAuditEvent, writeRouteAudit } from '../services/auditEvents';

export const partnersRoutes = new Hono();

const paginationSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional()
});

const createPartnerSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).max(100),
  type: z.enum(['msp', 'enterprise', 'internal']).optional(),
  maxOrganizations: z.number().int().nullable().optional(),
  settings: z.any().optional(),
  ssoConfig: z.any().optional(),
  billingEmail: z.string().email().optional()
});

const updatePartnerSchema = createPartnerSchema.partial();

const dayScheduleSchema = z.object({
  start: z.string(),
  end: z.string(),
  closed: z.boolean().optional()
});

const partnerSettingsSchema = z.object({
  timezone: z.string().optional(),
  dateFormat: z.enum(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']).optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
  language: z.literal('en').optional(),
  businessHours: z.object({
    preset: z.enum(['24/7', 'business', 'extended', 'custom']),
    custom: z.record(z.string(), dayScheduleSchema).optional()
  }).optional(),
  contact: z.object({
    name: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    website: z.string().optional()
  }).optional(),
  security: z.object({
    minLength: z.number().int().min(6).max(128).optional(),
    complexity: z.enum(['standard', 'strict', 'passphrase']).optional(),
    expirationDays: z.number().int().min(0).optional(),
    requireMfa: z.boolean().optional(),
    allowedMethods: z.object({ totp: z.boolean().optional(), sms: z.boolean().optional() }).optional(),
    sessionTimeout: z.number().int().min(1).optional(),
    maxSessions: z.number().int().min(1).optional(),
    ipAllowlist: z.array(z.string()).optional(),
  }).optional(),
  notifications: z.object({
    fromAddress: z.string().optional(),
    replyTo: z.string().optional(),
    useCustomSmtp: z.boolean().optional(),
    smtpHost: z.string().optional(),
    smtpPort: z.number().int().optional(),
    smtpUsername: z.string().optional(),
    smtpEncryption: z.enum(['tls', 'ssl', 'none']).optional(),
    slackWebhookUrl: z.string().optional(),
    slackChannel: z.string().optional(),
    webhooks: z.array(z.string()).optional(),
    preferences: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
  }).optional(),
  eventLogs: z.object({
    enabled: z.boolean().optional(),
    elasticsearchUrl: z.string().optional(),
    elasticsearchApiKey: z.string().optional(),
    elasticsearchUsername: z.string().optional(),
    elasticsearchPassword: z.string().optional(),
    indexPrefix: z.string().optional(),
  }).optional(),
  defaults: z.object({
    policyDefaults: z.record(z.string(), z.string()).optional(),
    deviceGroup: z.string().optional(),
    alertThreshold: z.string().optional(),
    autoEnrollment: z.object({
      enabled: z.boolean(),
      requireApproval: z.boolean(),
      sendWelcome: z.boolean(),
    }).optional(),
    agentUpdatePolicy: z.string().optional(),
    maintenanceWindow: z.string().optional(),
  }).optional(),
  branding: z.object({
    logoUrl: z.string().optional(),
    primaryColor: z.string().optional(),
    secondaryColor: z.string().optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
    customCss: z.string().optional(),
  }).optional(),
  aiBudgets: z.object({
    enabled: z.boolean().optional(),
    monthlyBudgetCents: z.number().int().min(0).nullable().optional(),
    dailyBudgetCents: z.number().int().min(0).nullable().optional(),
    maxTurnsPerSession: z.number().int().min(1).max(200).optional(),
    messagesPerMinutePerUser: z.number().int().min(1).max(100).optional(),
    messagesPerHourPerOrg: z.number().int().min(1).max(10000).optional(),
    approvalMode: z.enum(['per_step', 'action_plan', 'auto_approve', 'hybrid_plan']).optional(),
  }).optional(),
});

const updatePartnerSettingsSchema = z.object({
  settings: partnerSettingsSchema.optional(),
  name: z.string().min(1).optional(),
  billingEmail: z.string().email().optional()
});

function getPagination(query: { page?: string; limit?: string }) {
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '50', 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

async function resolveAuditOrgIdForPartner(partnerId: string | null): Promise<string | null> {
  if (!partnerId) {
    return null;
  }

  try {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.partnerId, partnerId), isNull(organizations.deletedAt)))
      .orderBy(organizations.createdAt)
      .limit(1);

    return org?.id ?? null;
  } catch (err) {
    console.error('[audit] Failed to resolve orgId for partner:', partnerId, err);
    return null;
  }
}

partnersRoutes.use('*', authMiddleware);

partnersRoutes.get('/', requireScope('system'), zValidator('query', paginationSchema), async (c) => {
  const { page, limit, offset } = getPagination(c.req.valid('query'));

  const conditions = isNull(partners.deletedAt);
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(partners)
    .where(conditions);
  const count = countResult[0]?.count ?? 0;

  const data = await db
    .select()
    .from(partners)
    .where(conditions)
    .limit(limit)
    .offset(offset)
    .orderBy(partners.createdAt);

  return c.json({
    data,
    pagination: { page, limit, total: Number(count) }
  });
});

partnersRoutes.post('/', requireScope('system'), zValidator('json', createPartnerSchema), async (c) => {
  const auth = c.get('auth');
  const data = c.req.valid('json');

  const [partner] = await db
    .insert(partners)
    .values({
      name: data.name,
      slug: data.slug,
      type: data.type,
      maxOrganizations: data.maxOrganizations,
      settings: data.settings,
      ssoConfig: data.ssoConfig,
      billingEmail: data.billingEmail
    })
    .returning();

  writeAuditEvent(c, {
    orgId: auth.orgId,
    actorId: auth.user?.id,
    actorEmail: auth.user?.email,
    action: 'partner.create',
    resourceType: 'partner',
    resourceId: partner?.id,
    resourceName: partner?.name,
    details: {
      slug: partner?.slug,
      type: partner?.type,
      plan: partner?.plan
    }
  });

  return c.json(partner, 201);
});

partnersRoutes.get('/me', requireScope('partner'), requirePartner, async (c) => {
  const auth = c.get('auth');

  const [partner] = await db
    .select()
    .from(partners)
    .where(and(eq(partners.id, auth.partnerId as string), isNull(partners.deletedAt)))
    .limit(1);

  if (!partner) {
    return c.json({ error: 'Partner not found' }, 404);
  }

  return c.json(partner);
});

partnersRoutes.patch('/me', requireScope('partner'), requirePartner, zValidator('json', updatePartnerSettingsSchema), async (c) => {
  const auth = c.get('auth');
  const body = c.req.valid('json');

  const [current] = await db
    .select()
    .from(partners)
    .where(and(eq(partners.id, auth.partnerId as string), isNull(partners.deletedAt)))
    .limit(1);

  if (!current) {
    return c.json({ error: 'Partner not found' }, 404);
  }

  const currentSettings = (current.settings as Record<string, unknown>) || {};
  const newSettings = body.settings
    ? { ...currentSettings, ...body.settings }
    : currentSettings;

  const updateData: Record<string, unknown> = {
    settings: newSettings,
    updatedAt: new Date()
  };

  if (body.name) updateData.name = body.name;
  if (body.billingEmail) updateData.billingEmail = body.billingEmail;

  const [partner] = await db
    .update(partners)
    .set(updateData)
    .where(and(eq(partners.id, auth.partnerId as string), isNull(partners.deletedAt)))
    .returning();

  const auditOrgId = await resolveAuditOrgIdForPartner(auth.partnerId);
  writeRouteAudit(c, {
    orgId: auditOrgId,
    action: 'partner.settings.update',
    resourceType: 'partner',
    resourceId: partner?.id,
    resourceName: partner?.name,
    details: { changedFields: Object.keys(body) }
  });

  return c.json(partner);
});

partnersRoutes.get('/:id', requireScope('system'), async (c) => {
  const id = c.req.param('id')!;

  const [partner] = await db
    .select()
    .from(partners)
    .where(and(eq(partners.id, id), isNull(partners.deletedAt)))
    .limit(1);

  if (!partner) {
    return c.json({ error: 'Partner not found' }, 404);
  }

  return c.json(partner);
});

partnersRoutes.patch('/:id', requireScope('system', 'partner'), zValidator('json', updatePartnerSchema), async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;

  if (auth.scope === 'partner' && auth.partnerId !== id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const data = c.req.valid('json');
  const updates = { ...data, updatedAt: new Date() };

  if (Object.keys(data).length === 0) {
    return c.json({ error: 'No updates provided' }, 400);
  }

  const [partner] = await db
    .update(partners)
    .set(updates)
    .where(and(eq(partners.id, id), isNull(partners.deletedAt)))
    .returning();

  if (!partner) {
    return c.json({ error: 'Partner not found' }, 404);
  }

  const auditOrgId = auth.orgId ?? await resolveAuditOrgIdForPartner(id);
  writeAuditEvent(c, {
    orgId: auditOrgId,
    actorId: auth.user?.id,
    actorEmail: auth.user?.email,
    action: 'partner.update',
    resourceType: 'partner',
    resourceId: partner.id,
    resourceName: partner.name,
    details: {
      changedFields: Object.keys(data)
    }
  });

  return c.json(partner);
});

partnersRoutes.delete('/:id', requireScope('system'), async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;

  const [partner] = await db
    .update(partners)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(partners.id, id), isNull(partners.deletedAt)))
    .returning();

  if (!partner) {
    return c.json({ error: 'Partner not found' }, 404);
  }

  const auditOrgId = auth.orgId ?? await resolveAuditOrgIdForPartner(id);
  writeAuditEvent(c, {
    orgId: auditOrgId,
    actorId: auth.user?.id,
    actorEmail: auth.user?.email,
    action: 'partner.delete',
    resourceType: 'partner',
    resourceId: partner.id,
    resourceName: partner.name
  });

  return c.json({ success: true });
});
