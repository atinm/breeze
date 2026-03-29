import { describe, expect, it } from 'vitest';
import { mergeProviderConfigOptions, parseProviderConfigOptions, toProviderConfigResponse } from './providerConfigOptions';

describe('providerConfigOptions', () => {
  it('parses known provider option fields', () => {
    const parsed = parseProviderConfigOptions({
      apiKey: 'secret',
      localEstimatedInputCostPerMillionCents: 123,
      localEstimatedOutputCostPerMillionCents: 456,
      custom: 'value',
    });

    expect(parsed.apiKey).toBe('secret');
    expect(parsed.localEstimatedInputCostPerMillionCents).toBe(123);
    expect(parsed.localEstimatedOutputCostPerMillionCents).toBe(456);
    expect(parsed.custom).toBe('value');
  });

  it('merges updates and allows clearing key', () => {
    const merged = mergeProviderConfigOptions(
      { apiKey: 'old', custom: 'x' },
      { apiKey: null, localEstimatedInputCostPerMillionCents: 50 },
    );

    expect(merged?.apiKey).toBeUndefined();
    expect(merged?.custom).toBe('x');
    expect(merged?.localEstimatedInputCostPerMillionCents).toBe(50);
  });

  it('redacts secrets in API response payload', () => {
    const response = toProviderConfigResponse({
      apiKey: 'dont-return-me',
      localEstimatedInputCostPerMillionCents: 7,
      localEstimatedOutputCostPerMillionCents: 8,
      custom: true,
    });

    expect(response.apiKeySet).toBe(true);
    expect(response.localEstimatedInputCostPerMillionCents).toBe(7);
    expect(response.localEstimatedOutputCostPerMillionCents).toBe(8);
    expect(response.options).toEqual({ custom: true });
  });
});
