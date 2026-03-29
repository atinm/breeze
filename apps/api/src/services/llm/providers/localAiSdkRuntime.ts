import { randomUUID } from 'crypto';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { AsyncEventQueue } from '../../../utils/asyncQueue';
import type { LlmProviderStartInput, LlmRuntimeQuery } from '../types';

type LocalAiSdkConfig = {
  baseUrl: string;
  apiKey?: string;
};

type LocalModelProvider = {
  chat?: (modelId: string) => unknown;
  (modelId: string): unknown;
};

type CreateOpenAI = (options: { baseURL?: string; apiKey?: string }) => LocalModelProvider;

type GenerateTextResult = {
  text?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

type GenerateText = (input: {
  model: unknown;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  abortSignal?: AbortSignal;
}) => Promise<GenerateTextResult>;

export class LocalAiSdkRuntimeQuery implements LlmRuntimeQuery {
  private readonly output = new AsyncEventQueue<any>();
  private readonly messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private currentRequestController: AbortController | null = null;
  private interrupted = false;
  private closed = false;
  private readonly sessionId: string;
  private providerPromise: Promise<LocalModelProvider> | null = null;
  private generateTextPromise: Promise<GenerateText> | null = null;

  constructor(
    private readonly input: LlmProviderStartInput,
    private readonly config: LocalAiSdkConfig,
  ) {
    this.sessionId = input.resumeSessionId ?? `local-${randomUUID()}`;
    this.output.push({ type: 'system', subtype: 'init', session_id: this.sessionId });
    void this.processInputLoop();
  }

  private async getProvider(): Promise<LocalModelProvider> {
    if (!this.providerPromise) {
      this.providerPromise = import('@ai-sdk/openai')
        .then((mod) => {
          const createOpenAI = (mod as unknown as { createOpenAI: CreateOpenAI }).createOpenAI;
          return createOpenAI({
            baseURL: this.config.baseUrl,
            apiKey: this.config.apiKey,
          });
        });
    }
    return this.providerPromise;
  }

  private async getGenerateText(): Promise<GenerateText> {
    if (!this.generateTextPromise) {
      this.generateTextPromise = import('ai')
        .then((mod) => (mod as unknown as { generateText: GenerateText }).generateText);
    }
    return this.generateTextPromise;
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
          errors: [err instanceof Error ? err.message : 'Local provider input stream failed'],
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

      const [provider, generateText] = await Promise.all([this.getProvider(), this.getGenerateText()]);
      const modelHandle = provider.chat ? provider.chat(this.input.model) : provider(this.input.model);

      const response = await generateText({
        model: modelHandle,
        system: this.input.systemPrompt,
        messages: [...this.messages],
        abortSignal: requestController.signal,
      });

      assistantText = response.text ?? '';
      inputTokens = response.usage?.inputTokens ?? 0;
      outputTokens = response.usage?.outputTokens ?? 0;

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
        : (err instanceof Error ? err.message : 'Local provider query failed');

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

export function createLocalAiSdkQuery(
  input: LlmProviderStartInput,
  config: LocalAiSdkConfig,
): LlmRuntimeQuery {
  return new LocalAiSdkRuntimeQuery(input, config);
}
