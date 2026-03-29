import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import type { LlmRemoteMcpServerDefinition } from '../types';

export function compileAnthropicToolServers(
  servers: Record<string, LlmRemoteMcpServerDefinition>,
): Record<string, McpServerConfig> {
  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, {
      type: 'sse' as const,
      url: server.url,
      headers: server.headers,
    }]),
  );
}
