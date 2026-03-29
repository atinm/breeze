import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { compileAnthropicToolServers } from '../adapters/anthropicMcpAdapter';
import type { LlmProvider, LlmProviderStartInput, LlmRuntimeQuery } from '../types';

export class ClaudeProvider implements LlmProvider {
  readonly id = 'claude';

  startQuery(input: LlmProviderStartInput): LlmRuntimeQuery {
    return query({
      prompt: input.prompt as AsyncIterable<SDKUserMessage>,
      options: {
        systemPrompt: input.systemPrompt,
        model: input.model,
        maxTurns: input.maxTurns,
        maxBudgetUsd: input.maxBudgetUsd,
        tools: [],
        allowedTools: input.allowedTools,
        mcpServers: compileAnthropicToolServers(input.mcpServers),
        includePartialMessages: input.includePartialMessages,
        abortController: input.abortController,
        resume: input.resumeSessionId,
        persistSession: input.persistSession,
        settingSources: [],
        thinking: { type: 'disabled' },
        stderr: input.onStderr,
      },
    });
  }
}
