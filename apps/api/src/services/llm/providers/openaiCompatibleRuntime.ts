import { randomUUID } from 'crypto';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { AsyncEventQueue } from '../../../utils/asyncQueue';
import type { LlmProviderStartInput, LlmRuntimeQuery } from '../types';

type OpenAICompatibleConfig = {
  providerName: string;
  baseUrl: string;
  apiKey?: string;
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function extractAssistantText(response: OpenAIChatResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part?.type === 'text' ? part.text ?? '' : ''))
      .join('');
  }
  return '';
}

export class OpenAICompatibleRuntimeQuery implements LlmRuntimeQuery {
  private readonly output = new AsyncEventQueue<any>();
  private readonly messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  private currentRequestController: AbortController | null = null;
  private interrupted = false;
  private closed = false;
  private readonly sessionId: string;
  private readonly endpoint: string;

  constructor(
    private readonly input: LlmProviderStartInput,
    private readonly config: OpenAICompatibleConfig,
  ) {
    this.sessionId = input.resumeSessionId ?? `${config.providerName}-${randomUUID()}`;
    this.endpoint = `${trimTrailingSlash(config.baseUrl)}/chat/completions`;
    this.messages.push({ role: 'system', content: input.systemPrompt });
    this.output.push({ type: 'system', subtype: 'init', session_id: this.sessionId });
    void this.processInputLoop();
  }

  private async processInputLoop(): Promise<void> {
    try {
      for await (const incoming of this.input.prompt) {
        if (this.closed) break;
        const msg = incoming as SDKUserMessage;
        const content = msg?.message?.content;
        if (typeof content !== 'string' || !content.trim()) continue;
        await this.processTurn(content);
      }
    } catch (err) {
      if (!this.closed) {
        this.output.push({
          type: 'result',
          subtype: 'error',
          errors: [err instanceof Error ? err.message : 'Provider input stream failed'],
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
    this.messages.push({ role: 'user', content: userContent });
    this.output.push({ type: 'stream_event', event: { type: 'message_start' } });

    let assistantText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const requestController = new AbortController();
      const abortForwarder = () => requestController.abort();
      this.currentRequestController = requestController;
      this.input.abortController.signal.addEventListener('abort', abortForwarder, { once: true });

      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };
      if (this.config.apiKey) {
        headers.authorization = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        signal: requestController.signal,
        body: JSON.stringify({
          model: this.input.model,
          messages: this.messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`${this.config.providerName} request failed (${response.status}): ${body || response.statusText}`);
      }

      const data = (await response.json()) as OpenAIChatResponse;
      assistantText = extractAssistantText(data);
      inputTokens = data.usage?.prompt_tokens ?? 0;
      outputTokens = data.usage?.completion_tokens ?? 0;

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
        : (err instanceof Error ? err.message : `${this.config.providerName} query failed`);

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
    if (this.currentRequestController) {
      this.currentRequestController.abort();
    }
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

export function createOpenAICompatibleQuery(
  input: LlmProviderStartInput,
  config: OpenAICompatibleConfig,
): LlmRuntimeQuery {
  return new OpenAICompatibleRuntimeQuery(input, config);
}
