import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalAiSdkQuery } from './localAiSdkRuntime';
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

describe('LocalAiSdkRuntimeQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses MCP-capable local responses API and emits assistant events', async () => {
    createResponseMock.mockResolvedValue({
      id: 'resp_local_1',
      output_text: 'Local answer',
      usage: {
        input_tokens: 9,
        output_tokens: 4,
      },
    });

    const query = createLocalAiSdkQuery(createPromptInput(['hello']), {
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'local-key',
    });

    const events = await collectEvents(query);

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
          delta: { type: 'text_delta', text: 'Local answer' },
        },
      },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Local answer' }], usage: { input_tokens: 9, output_tokens: 4 } } },
      { type: 'result', subtype: 'success', total_cost_usd: 0, usage: { input_tokens: 9, output_tokens: 4 }, num_turns: 1 },
    ]));
  });

  it('emits error result when local SDK generation fails', async () => {
    createResponseMock.mockRejectedValue(new Error('local model offline'));

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
