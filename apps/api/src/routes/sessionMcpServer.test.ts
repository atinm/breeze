import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const getSessionMock = vi.fn();

vi.mock('../services/streamingSessionManager', () => ({
  streamingSessionManager: {
    get: (...args: unknown[]) => getSessionMock(...args),
  },
}));

describe('sessionMcpServer', async () => {
  const { __private__ } = await import('./sessionMcpServer');
  const { defineTool, createToolServer } = await import('../services/llm/toolServer');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockSession() {
    getSessionMock.mockReturnValue({
      mcpServer: createToolServer({
        name: 'breeze',
        version: '1.0.0',
        tools: [
          defineTool(
            'echo',
            'Echo text',
            { text: z.string() },
            async ({ text }: { text: string }) => ({
              content: [{ type: 'text', text: JSON.stringify({ echoed: text }) }],
            }),
          ),
        ],
      }),
    });
  }

  it('returns initialize metadata for a live session MCP server', async () => {
    mockSession();

    const response = await __private__.handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'initialize' },
      'session-1',
      'breeze',
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'breeze', version: '1.0.0' },
      },
    });
  });

  it('lists tools from the session-scoped tool server', async () => {
    mockSession();

    const response = await __private__.handleJsonRpc(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      'session-1',
      'breeze',
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: {
        tools: [
          {
            name: 'echo',
            description: 'Echo text\n\nParameters:\n- text (required string)',
            inputSchema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              additionalProperties: false,
              required: ['text'],
            },
          },
        ],
      },
    });
  });

  it('executes a tool call through the session-scoped tool server', async () => {
    mockSession();

    const response = await __private__.handleJsonRpc(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'echo', arguments: { text: 'hello' } },
      },
      'session-1',
      'breeze',
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 3,
      result: {
        content: [{ type: 'text', text: JSON.stringify({ echoed: 'hello' }) }],
      },
    });
  });

  it('returns an error for invalid tool input', async () => {
    mockSession();

    const response = await __private__.handleJsonRpc(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'echo', arguments: {} },
      },
      'session-1',
      'breeze',
    );

    expect(response).not.toBeNull();
    if (!response) {
      throw new Error('Expected JSON-RPC error response');
    }
    expect(response.error?.code).toBe(-32602);
    expect(response.error?.message).toContain('Invalid tool input');
  });

  it('returns an error when the session MCP server is unavailable', async () => {
    getSessionMock.mockReturnValue(undefined);

    const response = await __private__.handleJsonRpc(
      { jsonrpc: '2.0', id: 5, method: 'initialize' },
      'missing-session',
      'breeze',
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 5,
      error: {
        code: -32000,
        message: 'Session MCP server is unavailable',
      },
    });
  });

  it('enriches tool descriptions with UUID guidance for id parameters', async () => {
    getSessionMock.mockReturnValue({
      mcpServer: createToolServer({
        name: 'breeze',
        version: '1.0.0',
        tools: [
          defineTool(
            'device_action',
            'Perform an action on a device',
            {
              deviceId: z.string().uuid(),
              relatedDeviceIds: z.array(z.string().uuid()).optional(),
            },
            async () => ({
              content: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
            }),
          ),
        ],
      }),
    });

    const response = await __private__.handleJsonRpc(
      { jsonrpc: '2.0', id: 6, method: 'tools/list' },
      'session-1',
      'breeze',
    );

    expect(response).not.toBeNull();
    if (!response || !response.result || typeof response.result !== 'object' || !('tools' in response.result)) {
      throw new Error('Expected tools/list response');
    }

    const toolDescription = (response.result as { tools: Array<{ description: string }> }).tools[0]?.description;
    expect(toolDescription).toBeDefined();
    expect(toolDescription).toContain(
      'must be a real Breeze UUID returned by another tool; do not invent placeholder values',
    );
    expect(toolDescription).toContain(
      'If you do not already know the real Breeze device UUID, call query_devices first to resolve it.',
    );
  });
});
