import type { AiProviderId } from '@breeze/shared/types/ai';
import type { LlmProvider } from './types';
import { ClaudeProvider } from './providers/claudeProvider';
import { OpenAIProvider } from './providers/openaiProvider';
import { LocalProvider } from './providers/localProvider';
import { GeminiProvider } from './providers/geminiProvider';
import { CopilotProvider } from './providers/copilotProvider';

export type ProviderRuntimeOverrides = {
  apiKey?: string;
  baseUrl?: string;
  apiVersion?: string;
  model?: string;
};

export function createLlmProvider(provider: AiProviderId, overrides?: ProviderRuntimeOverrides): LlmProvider {
  switch (provider) {
    case 'claude':
      return new ClaudeProvider();
    case 'openai':
      return new OpenAIProvider({ apiKey: overrides?.apiKey, baseUrl: overrides?.baseUrl });
    case 'local':
      return new LocalProvider({ apiKey: overrides?.apiKey, baseUrl: overrides?.baseUrl });
    case 'gemini':
      return new GeminiProvider({ apiKey: overrides?.apiKey, apiVersion: overrides?.apiVersion });
    case 'copilot':
      return new CopilotProvider({ model: overrides?.model });
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${String(exhaustive)}`);
    }
  }
}
