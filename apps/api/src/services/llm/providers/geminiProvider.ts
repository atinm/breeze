import type { LlmProvider, LlmProviderStartInput, LlmRuntimeQuery } from '../types';
import { createGeminiNativeQuery } from './geminiNativeRuntime';

export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini';

  constructor(
    private readonly options?: {
      apiKey?: string;
      apiVersion?: string;
    },
  ) {}

  startQuery(input: LlmProviderStartInput): LlmRuntimeQuery {
    const apiKey = this.options?.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required for Gemini provider');
    }

    return createGeminiNativeQuery(input, {
      apiKey,
      apiVersion: this.options?.apiVersion ?? process.env.GEMINI_API_VERSION,
    });
  }
}
