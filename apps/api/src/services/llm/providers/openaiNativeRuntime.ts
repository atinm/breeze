import { randomUUID } from 'crypto';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { AsyncEventQueue } from '../../../utils/asyncQueue';
import type { LlmProviderStartInput, LlmRuntimeQuery } from '../types';

type OpenAINativeConfig = {
  apiKey: string;
  baseUrl?: string;
};

type OpenAIChatCompletion = {
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

type OpenAIClient = {
  chat: {
    completions: {
      create(input: {
        model: string;
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
        stream?: false;
      }): Promise<OpenAIChatCompletion>;
    };
  };
};

type OpenAIModule = {
  default: new (options: { apiKey: string; baseURL?: string }) => OpenAIClient;
};

function extractAssistantText(response: OpenAIChatCompletion): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part?.type === 'text' ? part.text ?? '' : ''))
      .join('');
  }
  return '';
}

export class OpenAINativeRuntimeQuery implements LlmRuntimeQuery {
  private readonly output = new AsyncEventQueue<any>();
  private readonly messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  private currentRequestController: AbortController | null = null;
  private interrupted = false;
  private closed = false;
  private readonly sessionId: string;
  private clientPromise: Promise<OpenAIClient> | null = null;

  constructor(
    private readonly input: LlmProviderStartInput,
    private readonly config: OpenAINativeConfig,
  ) {
    this.sessionId = input.resumeSessionId ?? `openai-${randomUUID()}`;
    this.messages.push({ role: 'system', content: input.systemPrompt });
    this.output.push({ type: 'system', subtype: 'init', session_id: this.sessionId });
    void this.processInputLoop();
  }

  private async getClient(): Promise<OpenAIClient> {
    if (!this.clientPromise) {
      this.clientPromise = import('openai')
        .then((mod) => {
          const openAiModule = mod as unknown as OpenAIModule;
          return new openAiModule.default({
            apiKey: this.config.apiKey,
            baseURL: this.config.baseUrl,
          });
        });
    }
    return this.clientPromise;
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
          errors: [err instanceof Error ? err.message : 'OpenAI input stream failed'],
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

      const client = await this.getClient();
      const abortPromise = new Promise<never>((_, reject) => {
        requestController.signal.addEventListener('abort', () => reject(new Error('Interrupted')), { once: true });
      });

      const response = await Promise.race([
        client.chat.completions.create({
          model: this.input.model,
          messages: [...this.messages],
          stream: false,
        }),
        abortPromise,
      ]);

      assistantText = extractAssistantText(response);
      inputTokens = response.usage?.prompt_tokens ?? 0;
      outputTokens = response.usage?.completion_tokens ?? 0;

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
        : (err instanceof Error ? err.message : 'OpenAI query failed');

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

export function createOpenAINativeQuery(
  input: LlmProviderStartInput,
  config: OpenAINativeConfig,
): LlmRuntimeQuery {
  return new OpenAINativeRuntimeQuery(input, config);
}
