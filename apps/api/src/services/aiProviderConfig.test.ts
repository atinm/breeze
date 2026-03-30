import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSessionProvider } from './aiProviderConfig';

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
let queryResultsQueue: unknown[] = [];

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
  const setQueryResults = (...results: unknown[]) => {
    queryResultsQueue = [...results];
  };

  const setProviderConfigResult = (configRows: unknown[]) => {
    setQueryResults([{ partnerId: 'partner-1' }], configRows);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryResultsQueue = [];
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockImplementation(() => ({
      limit: () => Promise.resolve(queryResultsQueue.shift()),
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(queryResultsQueue.shift()).then(onFulfilled, onRejected),
    }));
  });

  it('falls back to claude session provider and model when no org config exists', async () => {
    setQueryResults([{ partnerId: 'partner-1' }], [], [{ partnerId: 'partner-1' }], []);

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

  it('rejects non-default providers when no org config exists', async () => {
    setQueryResults([{ partnerId: 'partner-1' }], [], [{ partnerId: 'partner-1' }], []);

    await expect(resolveSessionProvider(
      'org-1',
      { provider: 'claude', providerModel: 'claude-sonnet-4-5-20250929', model: 'claude-sonnet-4-5-20250929' },
      { provider: 'openai' },
    )).rejects.toThrow("AI provider 'openai' is disabled for this partner");
  });

  it('uses org default model for requested provider when config exists', async () => {
    setQueryResults([{ partnerId: 'partner-1' }], [{
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
    setQueryResults([{ partnerId: 'partner-1' }], [{
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
    setQueryResults([{ partnerId: 'partner-1' }], [{
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
    setQueryResults([{ partnerId: 'partner-1' }], [{
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
    setQueryResults([{ partnerId: 'partner-1' }], [{
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

  it('uses the enabled partner provider as the default for new sessions', async () => {
    setQueryResults(
      [{ partnerId: 'partner-1' }],
      [
        {
          provider: 'gemini',
          enabled: true,
          defaultModel: 'gemini-2.5-pro',
          allowedModels: null,
          endpoint: null,
          apiKeyRef: null,
          options: null,
        },
      ]
    );

    const resolved = await resolveSessionProvider(
      'org-1',
      { provider: null, providerModel: null, model: null },
      undefined,
    );

    expect(resolved).toEqual({
      provider: 'gemini',
      providerModel: 'gemini-2.5-pro',
    });
  });

  it('rejects when org does not resolve to a partner', async () => {
    setQueryResults([], []);

    await expect(resolveSessionProvider(
      'org-missing',
      { provider: 'claude', providerModel: 'claude-sonnet-4-5-20250929', model: 'claude-sonnet-4-5-20250929' },
      undefined,
    )).rejects.toThrow("Organization 'org-missing' not found or has no partner");
  });
});
