import type { LlmProvider, LlmProviderStartInput, LlmRuntimeQuery } from '../types';
import { createCopilotNativeQuery } from './copilotNativeRuntime';

export class CopilotProvider implements LlmProvider {
  readonly id = 'copilot';

  constructor(
    private readonly options?: {
      model?: string;
    },
  ) {}

  startQuery(input: LlmProviderStartInput): LlmRuntimeQuery {
    return createCopilotNativeQuery(input, {
      model: this.options?.model ?? process.env.COPILOT_MODEL,
    });
  }
}
