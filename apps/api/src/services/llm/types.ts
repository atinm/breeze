import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

export interface LlmRuntimeQuery<TMessage = any> extends AsyncIterable<TMessage> {
  interrupt(): Promise<void>;
  close(): void;
}

export interface LlmProviderStartInput {
  prompt: AsyncIterable<SDKUserMessage>;
  model: string;
  systemPrompt: string;
  maxTurns: number;
  maxBudgetUsd: number | undefined;
  allowedTools: string[];
  mcpServers: Record<string, unknown>;
  abortController: AbortController;
  resumeSessionId: string | undefined;
  persistSession: boolean;
  includePartialMessages: boolean;
  onStderr?: (data: string) => void;
}

export interface LlmProvider {
  readonly id: string;
  startQuery(input: LlmProviderStartInput): LlmRuntimeQuery;
}
