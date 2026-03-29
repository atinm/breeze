import { describe, expect, it } from 'vitest';
import { createLlmProvider } from './providerRegistry';
import { ClaudeProvider } from './providers/claudeProvider';
import { OpenAIProvider } from './providers/openaiProvider';
import { LocalProvider } from './providers/localProvider';
import { GeminiProvider } from './providers/geminiProvider';
import { CopilotProvider } from './providers/copilotProvider';

describe('createLlmProvider', () => {
  it('returns ClaudeProvider for claude', () => {
    const provider = createLlmProvider('claude');
    expect(provider).toBeInstanceOf(ClaudeProvider);
  });

  it('returns OpenAIProvider for openai', () => {
    const provider = createLlmProvider('openai');
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it('returns LocalProvider for local', () => {
    const provider = createLlmProvider('local');
    expect(provider).toBeInstanceOf(LocalProvider);
  });

  it('returns GeminiProvider for gemini', () => {
    const provider = createLlmProvider('gemini');
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it('returns CopilotProvider for copilot', () => {
    const provider = createLlmProvider('copilot');
    expect(provider).toBeInstanceOf(CopilotProvider);
  });
});
