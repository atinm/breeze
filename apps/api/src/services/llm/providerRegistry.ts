import type { AiProviderId } from '@breeze/shared/types/ai';
import type { LlmProvider } from './types';
import { ClaudeProvider } from './providers/claudeProvider';
import { OpenAIProvider } from './providers/openaiProvider';
import { LocalProvider } from './providers/localProvider';
import { GeminiProvider } from './providers/geminiProvider';
import { CopilotProvider } from './providers/copilotProvider';

export function createLlmProvider(provider: AiProviderId): LlmProvider {
  switch (provider) {
    case 'claude':
      return new ClaudeProvider();
    case 'openai':
      return new OpenAIProvider();
    case 'local':
      return new LocalProvider();
    case 'gemini':
      return new GeminiProvider();
    case 'copilot':
      return new CopilotProvider();
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${String(exhaustive)}`);
    }
  }
}
