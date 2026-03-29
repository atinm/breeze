import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGeminiNativeQuery } from './geminiNativeRuntime';
import { createPromptInput } from './testHelpers';

const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: (...args: unknown[]) => generateContentMock(...args),
    };
  },
}));

async function collectEvents(query: AsyncIterable<any>): Promise<any[]> {
  const events: any[] = [];
  for await (const event of query) {
    events.push(event);
  }
  return events;
}

describe('GeminiNativeRuntimeQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits assistant events using the native Gemini SDK', async () => {
    generateContentMock.mockResolvedValue({
      text: 'Gemini answer',
      usageMetadata: {
        promptTokenCount: 11,
        candidatesTokenCount: 5,
      },
    });

    const query = createGeminiNativeQuery(createPromptInput(['hello']), {
      apiKey: 'test-key',
      apiVersion: 'v1beta',
    });

    const events = await collectEvents(query);

    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-model',
        config: { systemInstruction: 'System prompt' },
      }),
    );

    expect(events).toEqual(expect.arrayContaining([
      { type: 'system', subtype: 'init', session_id: expect.any(String) },
      { type: 'stream_event', event: { type: 'message_start' } },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Gemini answer' },
        },
      },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Gemini answer' }], usage: { input_tokens: 11, output_tokens: 5 } } },
      { type: 'result', subtype: 'success', total_cost_usd: 0, usage: { input_tokens: 11, output_tokens: 5 }, num_turns: 1 },
    ]));
  });

  it('emits error result when Gemini SDK call fails', async () => {
    generateContentMock.mockRejectedValue(new Error('gemini unavailable'));

    const query = createGeminiNativeQuery(createPromptInput(['hello']), {
      apiKey: 'test-key',
    });

    const events = await collectEvents(query);
    const errorResult = events.find((event) => event.type === 'result' && event.subtype === 'error');

    expect(errorResult).toEqual(expect.objectContaining({
      type: 'result',
      subtype: 'error',
      errors: ['gemini unavailable'],
    }));
  });
});
