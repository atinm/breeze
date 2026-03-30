import type { LlmProvider, LlmProviderStartInput, LlmRuntimeQuery } from '../types';
import { createOllamaBridgeQuery } from './ollamaBridgeRuntime';

export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama';

  constructor(
    private readonly options?: {
      baseUrl?: string;
    },
  ) {}

  startQuery(input: LlmProviderStartInput): LlmRuntimeQuery {
    return createOllamaBridgeQuery(input, {
      baseUrl: this.options?.baseUrl ?? process.env.OLLAMA_BRIDGE_BASE_URL ?? 'http://localhost:8000',
    });
  }
}
