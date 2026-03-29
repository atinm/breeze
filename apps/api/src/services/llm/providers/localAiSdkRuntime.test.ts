import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalAiSdkQuery } from './localAiSdkRuntime';
import { createPromptInput } from './testHelpers';

const createOpenAIMock = vi.fn();
const providerChatMock = vi.fn();
const generateTextMock = vi.fn();

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: (...args: unknown[]) => createOpenAIMock(...args),
}));

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

async function collectEvents(query: AsyncIterable<any>): Promise<any[]> {
  const events: any[] = [];
  for await (const event of query) {
    events.push(event);
  }
  return events;
}

describe('LocalAiSdkRuntimeQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerChatMock.mockReturnValue({ model: 'handle' });
    createOpenAIMock.mockReturnValue({
      chat: providerChatMock,
    });
  });

  it('uses @ai-sdk/openai provider and emits assistant events', async () => {
    generateTextMock.mockResolvedValue({
      text: 'Local answer',
      usage: {
        inputTokens: 9,
        outputTokens: 4,
      },
    });

    const query = createLocalAiSdkQuery(createPromptInput(['hello']), {
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'local-key',
    });

    const events = await collectEvents(query);

    expect(createOpenAIMock).toHaveBeenCalledWith({
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'local-key',
    });
    expect(providerChatMock).toHaveBeenCalledWith('test-model');
    expect(generateTextMock).toHaveBeenCalledWith({
      model: { model: 'handle' },
      system: 'System prompt',
      messages: [{ role: 'user', content: 'hello' }],
      abortSignal: expect.any(AbortSignal),
    });

    expect(events).toEqual(expect.arrayContaining([
      { type: 'system', subtype: 'init', session_id: expect.any(String) },
      { type: 'stream_event', event: { type: 'message_start' } },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Local answer' },
        },
      },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Local answer' }], usage: { input_tokens: 9, output_tokens: 4 } } },
      { type: 'result', subtype: 'success', total_cost_usd: 0, usage: { input_tokens: 9, output_tokens: 4 }, num_turns: 1 },
    ]));
  });

  it('emits error result when local SDK generation fails', async () => {
    generateTextMock.mockRejectedValue(new Error('local model offline'));

    const query = createLocalAiSdkQuery(createPromptInput(['hello']), {
      baseUrl: 'http://localhost:11434/v1',
    });

    const events = await collectEvents(query);
    const errorResult = events.find((event) => event.type === 'result' && event.subtype === 'error');

    expect(errorResult).toEqual(expect.objectContaining({
      type: 'result',
      subtype: 'error',
      errors: ['local model offline'],
    }));
  });
});
