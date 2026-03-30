import { afterEach, describe, expect, it } from 'vitest';
import { calculateProviderCostCents, resolveRecordedCostCents } from './aiCostTracker';

describe('aiCostTracker provider-aware pricing', () => {
  const originalLocalInput = process.env.LOCAL_LLM_ESTIMATED_INPUT_COST_PER_MILLION_CENTS;
  const originalLocalOutput = process.env.LOCAL_LLM_ESTIMATED_OUTPUT_COST_PER_MILLION_CENTS;

  afterEach(() => {
    if (originalLocalInput === undefined) {
      delete process.env.LOCAL_LLM_ESTIMATED_INPUT_COST_PER_MILLION_CENTS;
    } else {
      process.env.LOCAL_LLM_ESTIMATED_INPUT_COST_PER_MILLION_CENTS = originalLocalInput;
    }

    if (originalLocalOutput === undefined) {
      delete process.env.LOCAL_LLM_ESTIMATED_OUTPUT_COST_PER_MILLION_CENTS;
    } else {
      process.env.LOCAL_LLM_ESTIMATED_OUTPUT_COST_PER_MILLION_CENTS = originalLocalOutput;
    }
  });

  it('defaults local provider cost to zero when no estimate is configured', () => {
    delete process.env.LOCAL_LLM_ESTIMATED_INPUT_COST_PER_MILLION_CENTS;
    delete process.env.LOCAL_LLM_ESTIMATED_OUTPUT_COST_PER_MILLION_CENTS;

    const cents = calculateProviderCostCents('local', 'llama3.1', 10_000, 5_000);
    expect(cents).toBe(0);
  });

  it('defaults ollama provider cost to zero when no estimate is configured', () => {
    delete process.env.LOCAL_LLM_ESTIMATED_INPUT_COST_PER_MILLION_CENTS;
    delete process.env.LOCAL_LLM_ESTIMATED_OUTPUT_COST_PER_MILLION_CENTS;

    const cents = calculateProviderCostCents('ollama', 'qwen3:8b', 10_000, 5_000);
    expect(cents).toBe(0);
  });

  it('uses local estimated pricing env overrides when configured', () => {
    process.env.LOCAL_LLM_ESTIMATED_INPUT_COST_PER_MILLION_CENTS = '50';
    process.env.LOCAL_LLM_ESTIMATED_OUTPUT_COST_PER_MILLION_CENTS = '200';

    const cents = calculateProviderCostCents('local', 'llama3.1', 1_000_000, 500_000);
    expect(cents).toBe(150);
  });

  it('prefers provider-reported total_cost_usd when available', () => {
    const cents = resolveRecordedCostCents(
      {
        total_cost_usd: 0.1234,
        usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      },
      'openai',
      'gpt-4.1-mini',
    );

    expect(cents).toBe(12.34);
  });

  it('falls back to token-based pricing when total_cost_usd is zero', () => {
    const cents = resolveRecordedCostCents(
      {
        total_cost_usd: 0,
        usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      },
      'claude',
      'claude-haiku-4-5-20251001',
    );

    expect(cents).toBe(600);
  });
});
