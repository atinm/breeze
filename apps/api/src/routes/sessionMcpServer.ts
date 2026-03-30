import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { verifyMcpSessionToken } from '../services/llm/mcpSessionAuth';
import { streamingSessionManager } from '../services/streamingSessionManager';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

function hasJsonRpcId(req: JsonRpcRequest): req is JsonRpcRequest & { id: string | number } {
  return typeof req.id === 'string' || typeof req.id === 'number';
}

const transportSessions = new Map<string, {
  queue: JsonRpcResponse[];
  sessionId: string;
  serverName: string;
  createdAt: number;
}>();

const TRANSPORT_TTL_MS = 30 * 60 * 1000;

export const sessionMcpServerRoutes = new Hono();

async function authenticate(c: any): Promise<{ sessionId: string; serverName: string } | null> {
  const header = c.req.header('authorization') || c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    console.warn('[SessionMcp] Missing bearer token', {
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      userAgent: c.req.header('user-agent') ?? null,
    });
    return null;
  }

  const verified = await verifyMcpSessionToken(header.slice('Bearer '.length).trim());
  if (!verified) {
    console.warn('[SessionMcp] Invalid session token', {
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      userAgent: c.req.header('user-agent') ?? null,
    });
    return null;
  }

  return verified;
}

sessionMcpServerRoutes.get('/sse', async (c) => {
  const auth = await authenticate(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  console.log('[SessionMcp] SSE session opened', {
    sessionId: auth.sessionId,
    serverName: auth.serverName,
    userAgent: c.req.header('user-agent') ?? null,
  });

  cleanupTransportSessions();

  const transportId = crypto.randomUUID();
  transportSessions.set(transportId, {
    queue: [],
    sessionId: auth.sessionId,
    serverName: auth.serverName,
    createdAt: Date.now(),
  });

  return streamSSE(c, async (stream) => {
    const baseUrl = new URL(c.req.url);
    const messageUrl = `${baseUrl.protocol}//${baseUrl.host}${baseUrl.pathname.replace('/sse', '/message')}?transportId=${transportId}`;
    await stream.writeSSE({ event: 'endpoint', data: messageUrl });

    let alive = true;
    const cleanup = () => {
      alive = false;
      transportSessions.delete(transportId);
      console.log('[SessionMcp] SSE session closed', {
        sessionId: auth.sessionId,
        serverName: auth.serverName,
        transportId,
      });
    };

    try {
      while (alive) {
        const current = transportSessions.get(transportId);
        if (!current) break;
        if (current.queue.length > 0) {
          const messages = current.queue.splice(0, current.queue.length);
          for (const message of messages) {
            await stream.writeSSE({ event: 'message', data: JSON.stringify(message) });
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } finally {
      cleanup();
    }
  });
});

sessionMcpServerRoutes.post('/message', async (c) => {
  const auth = await authenticate(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  const transportId = c.req.query('transportId');
  if (!transportId) return c.json({ error: 'Missing transportId' }, 400);

  const transport = transportSessions.get(transportId);
  if (!transport || transport.sessionId !== auth.sessionId || transport.serverName !== auth.serverName) {
    console.warn('[SessionMcp] Unknown transport session', {
      sessionId: auth.sessionId,
      serverName: auth.serverName,
      transportId,
      found: Boolean(transport),
    });
    return c.json({ error: 'Unknown transport session' }, 404);
  }

  let body: JsonRpcRequest;
  try {
    body = await c.req.json<JsonRpcRequest>();
  } catch {
    return c.json(jsonRpcError(null, -32700, 'Parse error: invalid JSON'), 400);
  }

  const response = await handleJsonRpc(body, auth.sessionId, auth.serverName);
  console.log('[SessionMcp] JSON-RPC request handled', {
    sessionId: auth.sessionId,
    serverName: auth.serverName,
    method: body.method,
    hasError: Boolean(response?.error),
    hasResponse: Boolean(response),
  });
  if (response) {
    transport.queue.push(response);
  }
  return c.json({ status: 'accepted' }, 202);
});

async function handleJsonRpc(
  req: JsonRpcRequest,
  sessionId: string,
  serverName: string,
): Promise<JsonRpcResponse | null> {
  const session = streamingSessionManager.get(sessionId);
  const toolServer = session?.mcpServer;

  if (!session || !toolServer || toolServer.name !== serverName) {
    console.warn('[SessionMcp] Tool server unavailable', {
      sessionId,
      serverName,
      hasSession: Boolean(session),
      hasToolServer: Boolean(toolServer),
      toolServerName: toolServer?.name ?? null,
    });
    return jsonRpcError(req.id, -32000, 'Session MCP server is unavailable');
  }

  try {
    switch (req.method) {
      case 'initialize':
        return jsonRpcResult(hasJsonRpcId(req) ? req.id : null, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: toolServer.name,
            version: toolServer.version ?? '1.0.0',
          },
        });
      case 'notifications/initialized':
        return null;
      case 'tools/list':
        return jsonRpcResult(hasJsonRpcId(req) ? req.id : null, {
          tools: toolServer.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputJsonSchema,
          })),
        });
      case 'tools/call':
        return handleToolsCall(hasJsonRpcId(req) ? req.id : null, req.params ?? {}, toolServer);
      default:
        return jsonRpcError(hasJsonRpcId(req) ? req.id : null, -32601, `Method not found: ${req.method}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return jsonRpcError(hasJsonRpcId(req) ? req.id : null, -32000, message);
  }
}

async function handleToolsCall(
  id: string | number | null,
  params: Record<string, unknown>,
  toolServer: NonNullable<ReturnType<typeof streamingSessionManager.get>>['mcpServer'],
): Promise<JsonRpcResponse> {
  const toolName = typeof params.name === 'string' ? params.name : '';
  const toolInput = (params.arguments ?? {}) as Record<string, unknown>;

  if (!toolName) return jsonRpcError(id, -32602, 'Missing required parameter: name');

  const tool = toolServer.tools.find((item) => item.name === toolName);
  if (!tool) return jsonRpcError(id, -32602, `Unknown tool: ${toolName}`);

  const parsed = tool.inputSchemaObject.safeParse(toolInput);
  if (!parsed.success) {
    return jsonRpcError(id, -32602, `Invalid tool input: ${parsed.error.message}`);
  }

  const result = await tool.handler(parsed.data);
  console.log('[SessionMcp] Tool call succeeded', {
    serverName: toolServer.name,
    toolName,
  });
  return jsonRpcResult(id, result);
}

function cleanupTransportSessions(): void {
  const now = Date.now();
  for (const [id, session] of transportSessions) {
    if (now - session.createdAt > TRANSPORT_TTL_MS) {
      transportSessions.delete(id);
    }
  }
}

function jsonRpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export const __private__ = {
  handleJsonRpc,
  handleToolsCall,
};
