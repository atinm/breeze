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
            description: 'Echo text',
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
});
