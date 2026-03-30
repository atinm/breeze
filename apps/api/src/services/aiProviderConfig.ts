import { db } from '../db';
import { aiProviderConfigs, organizations } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import type { AiProviderId } from '@breeze/shared/types/ai';
import { parseProviderConfigOptions } from './llm/providerConfigOptions';

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

const VALID_PROVIDERS = new Set<AiProviderId>(['claude', 'openai', 'gemini', 'copilot', 'local', 'ollama']);

function normalizeProvider(value: string | undefined | null): AiProviderId | null {
  if (!value) return null;
  return VALID_PROVIDERS.has(value as AiProviderId) ? (value as AiProviderId) : null;
}

function parseAllowedModels(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : null;
}

type PartnerProviderConfigRow = {
  enabled: boolean;
  defaultModel: string;
  allowedModels: unknown;
  endpoint: string | null;
  apiKeyRef: string | null;
  options: unknown;
};

async function getPartnerProviderConfig(
  orgId: string,
  provider: AiProviderId,
): Promise<PartnerProviderConfigRow | null> {
  const [org] = await db
    .select({ partnerId: organizations.partnerId })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org?.partnerId) {
    throw new Error(`Organization '${orgId}' not found or has no partner`);
  }

  const [config] = await db
    .select({
      enabled: aiProviderConfigs.enabled,
      defaultModel: aiProviderConfigs.defaultModel,
      allowedModels: aiProviderConfigs.allowedModels,
      endpoint: aiProviderConfigs.endpoint,
      apiKeyRef: aiProviderConfigs.apiKeyRef,
      options: aiProviderConfigs.options,
    })
    .from(aiProviderConfigs)
    .where(and(eq(aiProviderConfigs.partnerId, org.partnerId), eq(aiProviderConfigs.provider, provider)))
    .limit(1);

  return config ?? null;
}

async function getPartnerIdForOrg(orgId: string): Promise<string> {
  const [org] = await db
    .select({ partnerId: organizations.partnerId })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org?.partnerId) {
    throw new Error(`Organization '${orgId}' not found or has no partner`);
  }

  return org.partnerId;
}

async function getEnabledPartnerProviderConfig(
  orgId: string,
): Promise<{ provider: AiProviderId; config: PartnerProviderConfigRow } | null> {
  const partnerId = await getPartnerIdForOrg(orgId);

  const rows = await db
    .select({
      provider: aiProviderConfigs.provider,
      enabled: aiProviderConfigs.enabled,
      defaultModel: aiProviderConfigs.defaultModel,
      allowedModels: aiProviderConfigs.allowedModels,
      endpoint: aiProviderConfigs.endpoint,
      apiKeyRef: aiProviderConfigs.apiKeyRef,
      options: aiProviderConfigs.options,
    })
    .from(aiProviderConfigs)
    .where(eq(aiProviderConfigs.partnerId, partnerId));

  const enabled = rows.find((row) => row.enabled);
  if (!enabled) return null;

  return {
    provider: enabled.provider as AiProviderId,
    config: {
      enabled: enabled.enabled,
      defaultModel: enabled.defaultModel,
      allowedModels: enabled.allowedModels,
      endpoint: enabled.endpoint,
      apiKeyRef: enabled.apiKeyRef,
      options: enabled.options,
    },
  };
}

export async function resolveSessionProvider(
  orgId: string,
  session: SessionProviderSnapshot,
  requested?: ProviderRequest,
): Promise<{ provider: AiProviderId; providerModel: string }> {
  const requestedProvider = requested?.provider;
  const sessionProvider = normalizeProvider(session.provider);
  const requestedModel = requested?.providerModel ?? requested?.model;
  const fallbackModel = session.providerModel ?? session.model ?? DEFAULT_PROVIDER_MODEL;
  let provider = requestedProvider ?? sessionProvider ?? DEFAULT_PROVIDER;
  let config: PartnerProviderConfigRow | null = null;

  if (!requestedProvider && !sessionProvider) {
    const enabledDefault = await getEnabledPartnerProviderConfig(orgId);
    if (enabledDefault) {
      provider = enabledDefault.provider;
      config = enabledDefault.config;
    }
  }

  if (!config) {
    config = await getPartnerProviderConfig(orgId, provider);
  }

  if (!config) {
    if (provider !== DEFAULT_PROVIDER) {
      throw new Error(`AI provider '${provider}' is disabled for this partner`);
    }

    const providerModel = requestedModel ?? fallbackModel;
    if (!providerModel) {
      throw new Error(`No default model configured for provider '${provider}'`);
    }

    return { provider, providerModel };
  }

  if (!config.enabled) {
    throw new Error(`AI provider '${provider}' is disabled for this partner`);
  }

  const providerModel = requestedModel ?? config.defaultModel ?? fallbackModel;
  if (!providerModel) {
    throw new Error(`No default model configured for provider '${provider}'`);
  }

  const allowedModels = parseAllowedModels(config?.allowedModels);
  if (allowedModels && !allowedModels.includes(providerModel)) {
    throw new Error(`Model '${providerModel}' is not allowed for provider '${provider}'`);
  }

  return { provider, providerModel };
}

export async function resolveProviderRuntimeConfig(
  orgId: string,
  provider: AiProviderId,
): Promise<{
  endpoint: string | null;
  apiKeyRef: string | null;
  apiKey: string | null;
  localEstimatedInputCostPerMillionCents: number | null;
  localEstimatedOutputCostPerMillionCents: number | null;
}> {
  const config = await getPartnerProviderConfig(orgId, provider);
  if (!config) {
    return {
      endpoint: null,
      apiKeyRef: null,
      apiKey: null,
      localEstimatedInputCostPerMillionCents: null,
      localEstimatedOutputCostPerMillionCents: null,
    };
  }

  const options = parseProviderConfigOptions(config.options);
  return {
    endpoint: config.endpoint ?? null,
    apiKeyRef: config.apiKeyRef ?? null,
    apiKey: typeof options.apiKey === 'string' && options.apiKey.trim() ? options.apiKey.trim() : null,
    localEstimatedInputCostPerMillionCents:
      typeof options.localEstimatedInputCostPerMillionCents === 'number'
        ? options.localEstimatedInputCostPerMillionCents
        : null,
    localEstimatedOutputCostPerMillionCents:
      typeof options.localEstimatedOutputCostPerMillionCents === 'number'
        ? options.localEstimatedOutputCostPerMillionCents
        : null,
  };
}
