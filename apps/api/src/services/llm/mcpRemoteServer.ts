import type { LlmRemoteMcpServerDefinition } from './types';
import type { ToolServerDefinition } from './toolServer';
import { createMcpSessionToken } from './mcpSessionAuth';

function getApiBaseUrl(): string {
  const raw = process.env.PUBLIC_API_URL || process.env.BREEZE_SERVER || 'http://localhost:8787';
  return raw.replace(/\/+$/, '');
}

export async function buildRemoteMcpServerDefinition(
  sessionId: string,
  serverName: string,
  toolServer: ToolServerDefinition,
): Promise<LlmRemoteMcpServerDefinition> {
  const token = await createMcpSessionToken({ sessionId, serverName });
  return {
    name: serverName,
    url: `${getApiBaseUrl()}/api/v1/mcp/session/sse`,
    headers: {
      authorization: `Bearer ${token}`,
    },
    toolNamePrefix: `mcp__${serverName}__`,
    toolServer,
  };
}
