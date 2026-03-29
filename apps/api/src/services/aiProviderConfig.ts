import { db } from '../db';
import { aiProviderConfigs, organizations } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import type { AiProviderId } from '@breeze/shared/types/ai';

export const DEFAULT_PROVIDER: AiProviderId = 'claude';
export const DEFAULT_PROVIDER_MODEL = 'claude-sonnet-4-5-20250929';

export type ProviderRequest = {
  provider?: AiProviderId;
  providerModel?: string;
  model?: string;
};

type SessionProviderSnapshot = {
  provider?: string | null;
  providerModel?: string | null;
  model?: string | null;
};

const VALID_PROVIDERS = new Set<AiProviderId>(['claude', 'openai', 'gemini', 'copilot', 'local']);

function normalizeProvider(value: string | undefined | null): AiProviderId | null {
  if (!value) return null;
  return VALID_PROVIDERS.has(value as AiProviderId) ? (value as AiProviderId) : null;
}

function parseAllowedModels(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : null;
}

export async function resolveSessionProvider(
  orgId: string,
  session: SessionProviderSnapshot,
  requested?: ProviderRequest,
): Promise<{ provider: AiProviderId; providerModel: string }> {
  const provider = requested?.provider ?? normalizeProvider(session.provider) ?? DEFAULT_PROVIDER;
  const requestedModel = requested?.providerModel ?? requested?.model;
  const fallbackModel = session.providerModel ?? session.model ?? DEFAULT_PROVIDER_MODEL;

  const [org] = await db
    .select({ partnerId: organizations.partnerId })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org?.partnerId) {
    throw new Error(`Organization '${orgId}' not found or has no partner`);
  }

  const [config] = await db
    .select()
    .from(aiProviderConfigs)
    .where(and(eq(aiProviderConfigs.partnerId, org.partnerId), eq(aiProviderConfigs.provider, provider)))
    .limit(1);

  if (config && !config.enabled) {
    throw new Error(`AI provider '${provider}' is disabled for this partner`);
  }

  const providerModel = requestedModel ?? config?.defaultModel ?? fallbackModel;
  if (!providerModel) {
    throw new Error(`No default model configured for provider '${provider}'`);
  }

  const allowedModels = parseAllowedModels(config?.allowedModels);
  if (allowedModels && !allowedModels.includes(providerModel)) {
    throw new Error(`Model '${providerModel}' is not allowed for provider '${provider}'`);
  }

  return { provider, providerModel };
}
