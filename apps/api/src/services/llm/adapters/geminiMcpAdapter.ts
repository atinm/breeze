import type { LlmRemoteMcpServerDefinition } from '../types';

export type GeminiMcpTool = {
  mcpServers: Array<{
    name: string;
    streamableHttpTransport: {
      url: string;
      headers?: Record<string, string>;
    };
  }>;
};

export function compileGeminiMcpTools(
  servers: Record<string, LlmRemoteMcpServerDefinition>,
): GeminiMcpTool[] {
  const mcpServers = Object.values(servers).map((server) => ({
    name: server.name,
    streamableHttpTransport: {
      url: server.url,
      headers: server.headers,
    },
  }));

  return mcpServers.length > 0 ? [{ mcpServers }] : [];
}
