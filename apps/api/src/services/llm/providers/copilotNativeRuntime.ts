import { randomUUID } from 'crypto';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { AsyncEventQueue } from '../../../utils/asyncQueue';
import type { LlmProviderStartInput, LlmRuntimeQuery } from '../types';

type CopilotRuntimeConfig = {
  model?: string;
};

type CopilotResponse = {
  data?: {
    content?: string;
  };
};

type CopilotSession = {
  sendAndWait(input: { prompt: string }): Promise<CopilotResponse | undefined>;
  on(eventType: string, handler: (event: any) => void): (() => void) | void;
};

type CopilotClient = {
  createSession(input: { model: string; streaming?: boolean }): Promise<CopilotSession>;
  stop(): Promise<void>;
};

type CopilotSdkModule = {
  CopilotClient: new () => CopilotClient;
};

export class CopilotNativeRuntimeQuery implements LlmRuntimeQuery {
  private readonly output = new AsyncEventQueue<any>();
  private interrupted = false;
  private closed = false;
  private readonly sessionId: string;
  private clientPromise: Promise<CopilotClient> | null = null;
  private sessionPromise: Promise<CopilotSession> | null = null;
  private sessionUnsubscribe: (() => void) | null = null;
  private currentTurnFinished: (() => void) | null = null;

  constructor(
    private readonly input: LlmProviderStartInput,
    private readonly config: CopilotRuntimeConfig,
  ) {
    this.sessionId = input.resumeSessionId ?? `copilot-${randomUUID()}`;
    this.output.push({ type: 'system', subtype: 'init', session_id: this.sessionId });
    void this.processInputLoop();
  }

  private async getClient(): Promise<CopilotClient> {
    if (!this.clientPromise) {
      this.clientPromise = import('@github/copilot-sdk')
        .then((mod) => {
          const sdk = mod as unknown as CopilotSdkModule;
          return new sdk.CopilotClient();
        });
    }
    return this.clientPromise;
  }

  private async getSession(): Promise<CopilotSession> {
    if (!this.sessionPromise) {
      this.sessionPromise = this.getClient()
        .then((client) => client.createSession({
          model: this.config.model ?? this.input.model,
          streaming: true,
        }))
        .then((session) => {
          const unsubscribe = session.on('assistant.message_delta', (event: any) => {
            const delta = event?.data?.deltaContent;
            if (typeof delta === 'string' && delta.length > 0 && !this.closed) {
              this.output.push({
                type: 'stream_event',
                event: {
                  type: 'content_block_delta',
                  delta: { type: 'text_delta', text: delta },
                },
              });
            }
          });

          this.sessionUnsubscribe = typeof unsubscribe === 'function' ? unsubscribe : null;
          return session;
        });
    }
    return this.sessionPromise;
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
          errors: [err instanceof Error ? err.message : 'Copilot input stream failed'],
          total_cost_usd: 0,
          usage: { input_tokens: 0, output_tokens: 0 },
          num_turns: 1,
        });
      }
    } finally {
      await this.stopClient();
      this.output.close();
    }
  }

  private async processTurn(userContent: string): Promise<void> {
    this.interrupted = false;
    this.output.push({ type: 'stream_event', event: { type: 'message_start' } });

    let assistantText = '';
    const inputTokens = 0;
    const outputTokens = 0;

    try {
      const session = await this.getSession();
      const interruptPromise = new Promise<never>((_, reject) => {
        this.currentTurnFinished = () => reject(new Error('Interrupted'));
      });

      const response = await Promise.race([
        session.sendAndWait({ prompt: userContent }),
        interruptPromise,
      ]);
      assistantText = response?.data?.content ?? '';

      this.output.push({
        type: 'stream_event',
        event: {
          type: 'message_delta',
          usage: { output_tokens: outputTokens },
        },
      });

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
        : (err instanceof Error ? err.message : 'Copilot query failed');

      this.output.push({
        type: 'result',
        subtype: 'error',
        errors: [message],
        total_cost_usd: 0,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        num_turns: 1,
      });
    } finally {
      this.currentTurnFinished = null;
    }
  }

  private async stopClient(): Promise<void> {
    try {
      this.sessionUnsubscribe?.();
      this.sessionUnsubscribe = null;
      const client = await this.clientPromise;
      await client?.stop();
    } catch {
      // Ignore teardown errors during shutdown.
    }
  }

  async interrupt(): Promise<void> {
    this.interrupted = true;
    this.currentTurnFinished?.();
  }

  close(): void {
    this.closed = true;
    this.currentTurnFinished?.();
    void this.stopClient();
    this.output.close();
  }

  [Symbol.asyncIterator](): AsyncIterator<any> {
    return this.output[Symbol.asyncIterator]();
  }
}

export function createCopilotNativeQuery(
  input: LlmProviderStartInput,
  config: CopilotRuntimeConfig = {},
): LlmRuntimeQuery {
  return new CopilotNativeRuntimeQuery(input, config);
}
