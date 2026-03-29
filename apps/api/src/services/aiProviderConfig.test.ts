import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSessionProvider } from './aiProviderConfig';

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

vi.mock('../db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock('../db/schema', () => ({
  organizations: {
    id: 'id',
    partnerId: 'partner_id',
  },
  aiProviderConfigs: {
    partnerId: 'partner_id',
    provider: 'provider',
    enabled: 'enabled',
    defaultModel: 'default_model',
    allowedModels: 'allowed_models',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ _eq: args })),
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
}));

describe('resolveSessionProvider', () => {
  const setProviderConfigResult = (configRows: unknown[]) => {
    mockLimit
      .mockResolvedValueOnce([{ partnerId: 'partner-1' }])
      .mockResolvedValueOnce(configRows);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
  });

  it('falls back to session provider and model when no org config exists', async () => {
    setProviderConfigResult([]);

    const resolved = await resolveSessionProvider(
      'org-1',
      { provider: 'claude', providerModel: 'claude-sonnet-4-5-20250929', model: 'claude-sonnet-4-5-20250929' },
      undefined,
    );

    expect(resolved).toEqual({
      provider: 'claude',
      providerModel: 'claude-sonnet-4-5-20250929',
    });
  });

  it('uses org default model for requested provider when config exists', async () => {
    setProviderConfigResult([{
      enabled: true,
      defaultModel: 'claude-haiku-4-5-20251001',
      allowedModels: null,
    }]);

    const resolved = await resolveSessionProvider(
      'org-1',
      { provider: 'claude', providerModel: 'claude-sonnet-4-5-20250929', model: 'claude-sonnet-4-5-20250929' },
      { provider: 'claude' },
    );

    expect(resolved).toEqual({
      provider: 'claude',
      providerModel: 'claude-haiku-4-5-20251001',
    });
  });

  it('rejects disabled provider config', async () => {
    setProviderConfigResult([{
      enabled: false,
      defaultModel: 'gpt-4.1-mini',
      allowedModels: null,
    }]);

    await expect(resolveSessionProvider(
      'org-1',
      { provider: 'claude', providerModel: 'claude-sonnet-4-5-20250929', model: 'claude-sonnet-4-5-20250929' },
      { provider: 'openai' },
    )).rejects.toThrow("AI provider 'openai' is disabled for this partner");
  });

  it('rejects model not in allowedModels allowlist', async () => {
    setProviderConfigResult([{
      enabled: true,
      defaultModel: 'gpt-4.1-mini',
      allowedModels: ['gpt-4.1-mini'],
    }]);

    await expect(resolveSessionProvider(
      'org-1',
      { provider: 'claude', providerModel: 'claude-sonnet-4-5-20250929', model: 'claude-sonnet-4-5-20250929' },
      { provider: 'openai', providerModel: 'gpt-4.1' },
    )).rejects.toThrow("Model 'gpt-4.1' is not allowed for provider 'openai'");
  });

  it('allows providers that are runtime-enabled', async () => {
    setProviderConfigResult([{
      enabled: true,
      defaultModel: 'gpt-4.1-mini',
      allowedModels: null,
    }]);

    const resolved = await resolveSessionProvider(
      'org-1',
      { provider: 'claude', providerModel: 'claude-sonnet-4-5-20250929', model: 'claude-sonnet-4-5-20250929' },
      { provider: 'openai' },
    );

    expect(resolved).toEqual({
      provider: 'openai',
      providerModel: 'gpt-4.1-mini',
    });
  });

  it('allows gemini provider when configured', async () => {
    setProviderConfigResult([{
      enabled: true,
      defaultModel: 'gemini-2.5-pro',
      allowedModels: null,
    }]);

    const resolved = await resolveSessionProvider(
      'org-1',
      { provider: 'claude', providerModel: 'claude-sonnet-4-5-20250929', model: 'claude-sonnet-4-5-20250929' },
      { provider: 'gemini' },
    );

    expect(resolved).toEqual({
      provider: 'gemini',
      providerModel: 'gemini-2.5-pro',
    });
  });

  it('rejects when org does not resolve to a partner', async () => {
    mockLimit.mockResolvedValueOnce([]);

    await expect(resolveSessionProvider(
      'org-missing',
      { provider: 'claude', providerModel: 'claude-sonnet-4-5-20250929', model: 'claude-sonnet-4-5-20250929' },
      undefined,
    )).rejects.toThrow("Organization 'org-missing' not found or has no partner");
  });
});
