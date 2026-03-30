import { eq } from 'drizzle-orm';
import { db } from '../db';
import { organizations } from '../db/schema';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export async function getOrgEnrollmentSecret(orgId: string): Promise<string | null> {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const settings = asRecord(org?.settings);
  const defaults = asRecord(settings?.defaults);
  const secret = typeof defaults?.enrollmentSecret === 'string' ? defaults.enrollmentSecret.trim() : '';

  if (secret.length > 0) {
    return secret;
  }

  const fallback = process.env.AGENT_ENROLLMENT_SECRET?.trim();
  return fallback && fallback.length > 0 ? fallback : null;
}
