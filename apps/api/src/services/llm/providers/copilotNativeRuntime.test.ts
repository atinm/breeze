import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCopilotNativeQuery } from './copilotNativeRuntime';
import { createPromptInput } from './testHelpers';

const sendAndWaitMock = vi.fn();
const onMock = vi.fn();
const stopMock = vi.fn();
const createSessionMock = vi.fn();

vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: class {
    createSession = (...args: unknown[]) => createSessionMock(...args);
    stop = (...args: unknown[]) => stopMock(...args);
  },
}));

async function collectEvents(query: AsyncIterable<any>): Promise<any[]> {
  const events: any[] = [];
  for await (const event of query) {
    events.push(event);
  }
  return events;
}

describe('CopilotNativeRuntimeQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSessionMock.mockResolvedValue({
      on: onMock,
      sendAndWait: sendAndWaitMock,
    });
    onMock.mockImplementation((eventName: string, handler: (event: any) => void) => {
      if (eventName === 'assistant.message_delta') {
        handler({ data: { deltaContent: 'Chunk 1 ' } });
        handler({ data: { deltaContent: 'Chunk 2' } });
      }
      return vi.fn();
    });
    stopMock.mockResolvedValue(undefined);
  });

  it('emits assistant events using Copilot SDK', async () => {
    sendAndWaitMock.mockResolvedValue({
      data: { content: 'Final response' },
    });

    const query = createCopilotNativeQuery(createPromptInput(['hello']), {
      model: 'gpt-4.1',
    });

    const events = await collectEvents(query);

    expect(createSessionMock).toHaveBeenCalledWith({
      model: 'gpt-4.1',
      streaming: true,
    });
    expect(sendAndWaitMock).toHaveBeenCalledWith({ prompt: 'hello' });

    expect(events).toEqual(expect.arrayContaining([
      { type: 'system', subtype: 'init', session_id: expect.any(String) },
      { type: 'stream_event', event: { type: 'message_start' } },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Chunk 1 ' },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Chunk 2' },
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Final response' }],
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      },
      { type: 'result', subtype: 'success', total_cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 }, num_turns: 1 },
    ]));
  });

  it('emits error result when Copilot SDK call fails', async () => {
    sendAndWaitMock.mockRejectedValue(new Error('copilot unavailable'));

    const query = createCopilotNativeQuery(createPromptInput(['hello']), {
      model: 'gpt-4.1',
    });

    const events = await collectEvents(query);
    const errorResult = events.find((event) => event.type === 'result' && event.subtype === 'error');

    expect(errorResult).toEqual(expect.objectContaining({
      type: 'result',
      subtype: 'error',
      errors: ['copilot unavailable'],
    }));
  });
});
