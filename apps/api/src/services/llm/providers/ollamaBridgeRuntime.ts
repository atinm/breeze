import { randomUUID } from 'crypto';
import { AsyncEventQueue } from '../../../utils/asyncQueue';
import type { LlmProviderStartInput, LlmRuntimeQuery } from '../types';

type OllamaBridgeRuntimeConfig = {
  baseUrl: string;
};

type OllamaBridgeMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

function normalizeMcpHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};
  const entries = Object.entries(headers);
  const authorizationEntry = entries.find(([key]) => key.toLowerCase() === 'authorization');
  const normalized = Object.fromEntries(entries.filter(([key]) => key.toLowerCase() !== 'authorization'));
  if (authorizationEntry) {
    normalized.Authorization = authorizationEntry[1];
  }
  return normalized;
}

type OllamaBridgeResponse = {
  message?: {
    content?: string;
  };
  prompt_eval_count?: number;
  eval_count?: number;
};

export class OllamaBridgeRuntimeQuery implements LlmRuntimeQuery {
  private readonly output = new AsyncEventQueue<any>();
  private readonly sessionId: string;
  private readonly messages: OllamaBridgeMessage[] = [];
  private currentRequestController: AbortController | null = null;
  private interrupted = false;
  private closed = false;

  constructor(
    private readonly input: LlmProviderStartInput,
    private readonly config: OllamaBridgeRuntimeConfig,
  ) {
    this.sessionId = input.resumeSessionId ?? `ollama-${randomUUID()}`;
    this.output.push({ type: 'system', subtype: 'init', session_id: this.sessionId });
    void this.processInputLoop();
  }

  private async processInputLoop(): Promise<void> {
    try {
      for await (const incoming of this.input.prompt) {
        if (this.closed) break;
        const content = incoming.message.content;
        if (typeof content !== 'string' || !content.trim()) continue;
        await this.processTurn(content);
      }
    } catch (err) {
      if (!this.closed) {
        this.output.push({
          type: 'result',
          subtype: 'error',
          errors: [err instanceof Error ? err.message : 'Ollama input stream failed'],
          total_cost_usd: 0,
          usage: { input_tokens: 0, output_tokens: 0 },
          num_turns: 1,
        });
      }
    } finally {
      this.output.close();
    }
  }

  private async processTurn(userContent: string): Promise<void> {
    this.interrupted = false;
    this.output.push({ type: 'stream_event', event: { type: 'message_start' } });

    let assistantText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const requestController = new AbortController();
      this.currentRequestController = requestController;
      const abortForwarder = () => requestController.abort();
      this.input.abortController.signal.addEventListener('abort', abortForwarder, { once: true });

      const turnMessages = this.messages.length === 0
        ? [
            { role: 'system' as const, content: this.input.systemPrompt },
            { role: 'user' as const, content: userContent },
          ]
        : [...this.messages, { role: 'user' as const, content: userContent }];

      const requestScopedServers = Object.fromEntries(
        Object.entries(this.input.mcpServers).map(([name, server]) => [
          name,
          {
            url: server.url,
            headers: normalizeMcpHeaders(server.headers),
          },
        ]),
      );

      const response = await fetch(`${this.config.baseUrl.replace(/\/+$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.input.model,
          messages: turnMessages,
          stream: false,
          mcp: {
            servers: requestScopedServers,
          },
        }),
        signal: requestController.signal,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`${response.status} ${message}`.trim());
      }

      const payload = await response.json() as OllamaBridgeResponse;
      assistantText = payload.message?.content ?? '';
      inputTokens = payload.prompt_eval_count ?? 0;
      outputTokens = payload.eval_count ?? 0;

      if (assistantText) {
        this.output.push({
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: assistantText },
          },
        });
      }

      this.output.push({
        type: 'stream_event',
        event: {
          type: 'message_delta',
          usage: { output_tokens: outputTokens },
        },
      });

      this.messages.push({ role: 'user', content: userContent });
      this.messages.push({ role: 'assistant', content: assistantText });

      this.output.push({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: assistantText }],
          usage: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          },
        },
      });

      this.output.push({
        type: 'result',
        subtype: 'success',
        total_cost_usd: 0,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        num_turns: 1,
      });
    } catch (err) {
      const message = this.interrupted
        ? 'Interrupted'
        : (err instanceof Error ? err.message : 'Ollama query failed');

      this.output.push({
        type: 'result',
        subtype: 'error',
        errors: [message],
        total_cost_usd: 0,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        num_turns: 1,
      });
    } finally {
      this.currentRequestController = null;
    }
  }

  async interrupt(): Promise<void> {
    this.interrupted = true;
    this.currentRequestController?.abort();
  }

  close(): void {
    this.closed = true;
    this.currentRequestController?.abort();
    this.output.close();
  }

  [Symbol.asyncIterator](): AsyncIterator<any> {
    return this.output[Symbol.asyncIterator]();
  }
}

export function createOllamaBridgeQuery(
  input: LlmProviderStartInput,
  config: OllamaBridgeRuntimeConfig,
): LlmRuntimeQuery {
  return new OllamaBridgeRuntimeQuery(input, config);
}
