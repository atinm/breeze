import type { LlmPromptMessage, LlmProviderStartInput } from '../types';

export function createPromptInput(messages: string[] = []): LlmProviderStartInput {
  return {
    prompt: createPromptStream(messages),
    model: 'test-model',
    systemPrompt: 'System prompt',
    maxTurns: 10,
    maxBudgetUsd: undefined,
    allowedTools: [],
    mcpServers: {},
    abortController: new AbortController(),
    resumeSessionId: undefined,
    persistSession: false,
    includePartialMessages: false,
  };
}

async function* createPromptStream(messages: string[]): AsyncGenerator<LlmPromptMessage> {
  for (const message of messages) {
    yield {
      type: 'user',
      parent_tool_use_id: null,
      session_id: 'test-session',
      message: {
        role: 'user',
        content: message,
      },
    } satisfies LlmPromptMessage;
  }
}
