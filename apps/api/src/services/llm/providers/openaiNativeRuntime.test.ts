import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAINativeQuery } from './openaiNativeRuntime';
import { createPromptInput } from './testHelpers';

const createResponseMock = vi.fn();

vi.mock('openai', () => ({
  default: class {
    responses = {
      create: (...args: unknown[]) => createResponseMock(...args),
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

describe('OpenAINativeRuntimeQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits assistant events using OpenAI SDK', async () => {
    createResponseMock.mockResolvedValue({
      id: 'resp_123',
      output_text: 'OpenAI answer',
      usage: {
        input_tokens: 13,
        output_tokens: 6,
      },
    });

    const query = createOpenAINativeQuery(createPromptInput(['hello']), {
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
    });

    const events = await collectEvents(query);

    expect(createResponseMock).toHaveBeenCalledTimes(1);
    expect(createResponseMock).toHaveBeenCalledWith({
      model: 'test-model',
      input: 'hello',
      instructions: 'System prompt',
      previous_response_id: undefined,
      tools: [],
    });

    expect(events).toEqual(expect.arrayContaining([
      { type: 'system', subtype: 'init', session_id: expect.any(String) },
      { type: 'stream_event', event: { type: 'message_start' } },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'OpenAI answer' },
        },
      },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'OpenAI answer' }], usage: { input_tokens: 13, output_tokens: 6 } } },
      { type: 'result', subtype: 'success', total_cost_usd: 0, usage: { input_tokens: 13, output_tokens: 6 }, num_turns: 1 },
    ]));
  });

  it('emits error result when OpenAI SDK call fails', async () => {
    createResponseMock.mockRejectedValue(new Error('openai unavailable'));

    const query = createOpenAINativeQuery(createPromptInput(['hello']), {
      apiKey: 'test-key',
    });

    const events = await collectEvents(query);
    const errorResult = events.find((event) => event.type === 'result' && event.subtype === 'error');

    expect(errorResult).toEqual(expect.objectContaining({
      type: 'result',
      subtype: 'error',
      errors: ['openai unavailable'],
    }));
  });
});
