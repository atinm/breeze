import { randomUUID } from 'crypto';
import { AsyncEventQueue } from '../../../utils/asyncQueue';
import type { LlmProviderStartInput, LlmRuntimeQuery } from '../types';
import { compileOpenAIMcpTools } from '../adapters/openaiMcpAdapter';

type LocalRuntimeConfig = {
  baseUrl: string;
  apiKey?: string;
};

type LocalResponse = {
  id: string;
  output_text?: string;
  output?: Array<{
    id?: string;
    type?: string;
    name?: string;
    server_label?: string;
    arguments?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

type LocalClient = {
  responses: {
    create(input: {
      model: string;
      input: string;
      instructions?: string;
      previous_response_id?: string;
      tools?: unknown[];
    }): Promise<LocalResponse>;
  };
};

type OpenAIModule = {
  default: new (options: { apiKey?: string; baseURL: string }) => LocalClient;
};

export class LocalAiSdkRuntimeQuery implements LlmRuntimeQuery {
  private readonly output = new AsyncEventQueue<any>();
  private currentRequestController: AbortController | null = null;
  private interrupted = false;
  private closed = false;
  private readonly sessionId: string;
  private clientPromise: Promise<LocalClient> | null = null;
  private previousResponseId: string | null = null;

  constructor(
    private readonly input: LlmProviderStartInput,
    private readonly config: LocalRuntimeConfig,
  ) {
    this.sessionId = input.resumeSessionId ?? `local-${randomUUID()}`;
    this.output.push({ type: 'system', subtype: 'init', session_id: this.sessionId });
    void this.processInputLoop();
  }

  private async getClient(): Promise<LocalClient> {
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
        const content = incoming.message.content;
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
        client.responses.create({
          model: this.input.model,
          input: userContent,
          instructions: this.previousResponseId ? undefined : this.input.systemPrompt,
          previous_response_id: this.previousResponseId ?? undefined,
          tools: compileOpenAIMcpTools(this.input.mcpServers, this.input.allowedTools),
        }),
        abortPromise,
      ]);

      this.previousResponseId = response.id;
      assistantText = response.output_text ?? '';
      inputTokens = response.usage?.input_tokens ?? 0;
      outputTokens = response.usage?.output_tokens ?? 0;

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

      this.output.push({
        type: 'assistant',
        message: {
          content: [
            ...((response.output ?? [])
              .filter((item) => item.type === 'mcp_call' && typeof item.name === 'string' && typeof item.id === 'string')
              .map((item) => ({
                type: 'tool_use' as const,
                id: item.id!,
                name: `mcp__${item.server_label ?? this.findServerLabelForTool(item.name!)}__${item.name!}`,
                input: parseToolArguments(item.arguments),
              }))),
            { type: 'text', text: assistantText },
          ],
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

  private findServerLabelForTool(toolName: string): string {
    const matched = Object.values(this.input.mcpServers).find((server) => this.input.allowedTools
      .some((allowed) => allowed === `${server.toolNamePrefix}${toolName}`));
    return matched?.name ?? 'breeze';
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
  config: LocalRuntimeConfig,
): LlmRuntimeQuery {
  return new LocalAiSdkRuntimeQuery(input, config);
}

function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
