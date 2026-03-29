import type { LlmProvider, LlmProviderStartInput, LlmRuntimeQuery } from '../types';
import { createOpenAINativeQuery } from './openaiNativeRuntime';

export class OpenAIProvider implements LlmProvider {
  readonly id = 'openai';

  constructor(
    private readonly options?: {
      baseUrl?: string;
      apiKey?: string;
    },
  ) {}

  startQuery(input: LlmProviderStartInput): LlmRuntimeQuery {
    const apiKey = this.options?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI provider');
    }

    return createOpenAINativeQuery(input, {
      apiKey,
      baseUrl: this.options?.baseUrl ?? process.env.OPENAI_BASE_URL,
    });
  }
}
