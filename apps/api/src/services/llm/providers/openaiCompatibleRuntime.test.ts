import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAICompatibleQuery } from './openaiCompatibleRuntime';
import { createPromptInput } from './testHelpers';

type MockResponseInit = {
  ok: boolean;
  status?: number;
  statusText?: string;
  json?: unknown;
  text?: string;
};

function createMockResponse(init: MockResponseInit): Response {
  return {
    ok: init.ok,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: vi.fn(async () => init.json),
    text: vi.fn(async () => init.text ?? ''),
  } as unknown as Response;
}

async function collectEvents(query: AsyncIterable<any>): Promise<any[]> {
  const events: any[] = [];
  for await (const event of query) {
    events.push(event);
  }
  return events;
}

describe('OpenAICompatibleRuntimeQuery', () => {
  const originalFetch = global.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('emits assistant events and forwards expected request payload', async () => {
    fetchMock.mockResolvedValue(createMockResponse({
      ok: true,
      json: {
        choices: [{ message: { content: 'Hello from model' } }],
        usage: { prompt_tokens: 12, completion_tokens: 7 },
      },
    }));

    const input = createPromptInput(['Hello']);
    const query = createOpenAICompatibleQuery(input, {
      providerName: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'secret-key',
    });

    const events = await collectEvents(query);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          authorization: 'Bearer secret-key',
        }),
      }),
    );

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(requestInit).toBeDefined();
    expect(requestInit?.body).toBeTypeOf('string');

    const body = JSON.parse(requestInit!.body as string);
    expect(body).toEqual({
      model: 'test-model',
      messages: [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Hello' },
      ],
      stream: false,
    });

    expect(events).toEqual(expect.arrayContaining([
      { type: 'system', subtype: 'init', session_id: expect.any(String) },
      { type: 'stream_event', event: { type: 'message_start' } },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello from model' },
        },
      },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello from model' }], usage: { input_tokens: 12, output_tokens: 7 } } },
      { type: 'result', subtype: 'success', total_cost_usd: 0, usage: { input_tokens: 12, output_tokens: 7 }, num_turns: 1 },
    ]));
  });

  it('emits error result when provider request fails', async () => {
    fetchMock.mockResolvedValue(createMockResponse({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: 'invalid_api_key',
    }));

    const input = createPromptInput(['Hello']);
    const query = createOpenAICompatibleQuery(input, {
      providerName: 'openai',
      baseUrl: 'https://api.openai.com/v1/',
    });

    const events = await collectEvents(query);
    const errorResult = events.find((event) => event.type === 'result' && event.subtype === 'error');

    expect(errorResult).toEqual(expect.objectContaining({
      type: 'result',
      subtype: 'error',
      errors: [expect.stringContaining('openai request failed (401): invalid_api_key')],
    }));
  });
});
