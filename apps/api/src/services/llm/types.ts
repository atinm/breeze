import type { ToolServerDefinition } from './toolServer';

export interface LlmRemoteMcpServerDefinition {
  name: string;
  url: string;
  headers?: Record<string, string>;
  toolNamePrefix: string;
  toolServer?: ToolServerDefinition;
}

export interface LlmPromptMessage {
  type: 'user';
  parent_tool_use_id: string | null;
  session_id: string;
  message: {
    role: 'user' | 'assistant';
    content: unknown;
  };
}

export interface LlmSystemInitMessage {
  type: 'system';
  subtype: 'init';
  session_id: string;
}

export interface LlmTextDeltaEvent {
  type: 'content_block_delta';
  delta: {
    type: 'text_delta';
    text: string;
  };
}

export interface LlmMessageStartEvent {
  type: 'message_start';
}

export interface LlmToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmContentBlockStartEvent {
  type: 'content_block_start';
  content_block: LlmToolUseBlock | Record<string, unknown>;
}

export interface LlmMessageDeltaEvent {
  type: 'message_delta';
  usage?: {
    output_tokens?: number;
  };
}

export type LlmStreamEvent =
  | LlmMessageStartEvent
  | LlmTextDeltaEvent
  | LlmContentBlockStartEvent
  | LlmMessageDeltaEvent;

export interface LlmStreamEventMessage {
  type: 'stream_event';
  event: LlmStreamEvent;
}

export interface LlmAssistantTextBlock {
  type: 'text';
  text?: string;
}

export type LlmAssistantContentBlock =
  | LlmAssistantTextBlock
  | LlmToolUseBlock
  | Record<string, unknown>;

export interface LlmAssistantMessage {
  type: 'assistant';
  message: {
    content: LlmAssistantContentBlock[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
}

export interface LlmUserReplayMessage {
  type: 'user';
}

export interface LlmResultMessage {
  type: 'result';
  subtype: 'success' | 'error' | 'error_max_budget_usd' | 'error_max_turns' | string;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  num_turns?: number;
  errors?: string[];
}

export type LlmQueryMessage =
  | LlmSystemInitMessage
  | LlmStreamEventMessage
  | LlmAssistantMessage
  | LlmUserReplayMessage
  | LlmResultMessage;

export interface LlmRuntimeQuery<TMessage = LlmQueryMessage> extends AsyncIterable<TMessage> {
  interrupt(): Promise<void>;
  close(): void;
}

export interface LlmProviderStartInput {
  prompt: AsyncIterable<LlmPromptMessage>;
  model: string;
  systemPrompt: string;
  maxTurns: number;
  maxBudgetUsd: number | undefined;
  allowedTools: string[];
  mcpServers: Record<string, LlmRemoteMcpServerDefinition>;
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
