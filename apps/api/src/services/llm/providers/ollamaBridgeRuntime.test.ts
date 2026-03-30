import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOllamaBridgeQuery } from './ollamaBridgeRuntime';
import { createPromptInput } from './testHelpers';

async function collectEvents(query: AsyncIterable<any>): Promise<any[]> {
  const events: any[] = [];
  for await (const event of query) {
    events.push(event);
  }
  return events;
}

describe('OllamaBridgeRuntimeQuery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts chat requests to the Ollama bridge with request-scoped MCP servers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        message: { content: 'Ollama answer' },
        prompt_eval_count: 12,
        eval_count: 7,
      }),
    } as unknown as Response);

    const input = createPromptInput(['hello']);
    input.mcpServers = {
      breeze: {
        name: 'breeze',
        url: 'http://breeze.local/api/v1/mcp/session/sse',
        headers: { Authorization: 'Bearer token' },
        toolNamePrefix: 'mcp__breeze__',
      },
    };

    const query = createOllamaBridgeQuery(input, {
      baseUrl: 'http://ollama-bridge.local',
    });

    const events = await collectEvents(query);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://ollama-bridge.local/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          model: 'test-model',
          messages: [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'hello' },
          ],
          stream: false,
          mcp: {
            servers: {
              breeze: {
                url: 'http://breeze.local/api/v1/mcp/session/sse',
                headers: { Authorization: 'Bearer token' },
              },
            },
          },
        }),
      }),
    );

    expect(events).toEqual(expect.arrayContaining([
      { type: 'system', subtype: 'init', session_id: expect.any(String) },
      { type: 'stream_event', event: { type: 'message_start' } },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Ollama answer' },
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Ollama answer' }],
          usage: { input_tokens: 12, output_tokens: 7 },
        },
      },
      { type: 'result', subtype: 'success', total_cost_usd: 0, usage: { input_tokens: 12, output_tokens: 7 }, num_turns: 1 },
    ]));
  });

  it('emits an error result when the bridge returns a non-200 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      text: vi.fn().mockResolvedValue('404 page not found'),
    } as unknown as Response);

    const query = createOllamaBridgeQuery(createPromptInput(['hello']), {
      baseUrl: 'http://ollama-bridge.local',
    });

    const events = await collectEvents(query);
    const errorResult = events.find((event) => event.type === 'result' && event.subtype === 'error');

    expect(errorResult).toEqual(expect.objectContaining({
      type: 'result',
      subtype: 'error',
      errors: ['404 404 page not found'],
    }));
  });
});
