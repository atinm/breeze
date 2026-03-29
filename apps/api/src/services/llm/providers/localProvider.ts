import type { LlmProvider, LlmProviderStartInput, LlmRuntimeQuery } from '../types';
import { createLocalAiSdkQuery } from './localAiSdkRuntime';

export class LocalProvider implements LlmProvider {
  readonly id = 'local';

  constructor(
    private readonly options?: {
      baseUrl?: string;
      apiKey?: string;
    },
  ) {}

  startQuery(input: LlmProviderStartInput): LlmRuntimeQuery {
    return createLocalAiSdkQuery(input, {
      baseUrl: this.options?.baseUrl ?? process.env.LOCAL_LLM_BASE_URL ?? 'http://localhost:11434/v1',
      apiKey: this.options?.apiKey ?? process.env.LOCAL_LLM_API_KEY,
    });
  }
}
