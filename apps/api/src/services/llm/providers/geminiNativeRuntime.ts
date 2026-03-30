import { randomUUID } from 'crypto';
import { AsyncEventQueue } from '../../../utils/asyncQueue';
import type { LlmProviderStartInput, LlmRuntimeQuery } from '../types';
import { compileGeminiMcpTools } from '../adapters/geminiMcpAdapter';

type GeminiRuntimeConfig = {
  apiKey: string;
  apiVersion?: string;
};

type GeminiClient = {
  models: {
    generateContent(input: {
      model: string;
      contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
      config?: { systemInstruction?: string; tools?: unknown[] };
    }): Promise<unknown>;
  };
};

type GoogleGenAiModule = {
  GoogleGenAI: new (options: { apiKey: string; apiVersion?: string }) => GeminiClient;
};

function extractGeminiText(response: any): string {
  if (typeof response?.text === 'string') return response.text;
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('');
}

function extractGeminiUsage(response: any): { input: number; output: number } {
  const usage = response?.usageMetadata;
  return {
    input: typeof usage?.promptTokenCount === 'number' ? usage.promptTokenCount : 0,
    output: typeof usage?.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : 0,
  };
}

export class GeminiNativeRuntimeQuery implements LlmRuntimeQuery {
  private readonly output = new AsyncEventQueue<any>();
  private readonly messages: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  private currentRequestController: AbortController | null = null;
  private interrupted = false;
  private closed = false;
  private readonly sessionId: string;
  private clientPromise: Promise<GeminiClient> | null = null;

  constructor(
    private readonly input: LlmProviderStartInput,
    private readonly config: GeminiRuntimeConfig,
  ) {
    this.sessionId = input.resumeSessionId ?? `gemini-${randomUUID()}`;
    this.output.push({ type: 'system', subtype: 'init', session_id: this.sessionId });
    void this.processInputLoop();
  }

  private async getClient(): Promise<GeminiClient> {
    if (!this.clientPromise) {
      this.clientPromise = import('@google/genai')
        .then((mod) => {
          const geminiModule = mod as unknown as GoogleGenAiModule;
          return new geminiModule.GoogleGenAI({
            apiKey: this.config.apiKey,
            apiVersion: this.config.apiVersion,
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
          errors: [err instanceof Error ? err.message : 'Gemini input stream failed'],
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
      const turnContents = [
        ...this.messages,
        { role: 'user' as const, parts: [{ text: userContent }] },
      ];

      const abortPromise = new Promise<never>((_, reject) => {
        requestController.signal.addEventListener('abort', () => reject(new Error('Interrupted')), { once: true });
      });

      const response = await Promise.race([
        client.models.generateContent({
          model: this.input.model,
          contents: turnContents,
          config: {
            systemInstruction: this.input.systemPrompt,
            tools: compileGeminiMcpTools(this.input.mcpServers),
          },
        }),
        abortPromise,
      ]);

      assistantText = extractGeminiText(response);
      const usage = extractGeminiUsage(response);
      inputTokens = usage.input;
      outputTokens = usage.output;

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

      this.messages.push({ role: 'user', parts: [{ text: userContent }] });
      this.messages.push({ role: 'model', parts: [{ text: assistantText }] });

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
        : (err instanceof Error ? err.message : 'Gemini query failed');

      console.error('[GeminiRuntime] Query failed', {
        sessionId: this.sessionId,
        model: this.input.model,
        mcpServerNames: Object.keys(this.input.mcpServers),
        error: message,
      });

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

export function createGeminiNativeQuery(
  input: LlmProviderStartInput,
  config: GeminiRuntimeConfig,
): LlmRuntimeQuery {
  return new GeminiNativeRuntimeQuery(input, config);
}
