import type { LlmRemoteMcpServerDefinition } from '../types';

export type OpenAIMcpTool = {
  type: 'mcp';
  server_label: string;
  server_url: string;
  headers?: Record<string, string>;
  allowed_tools?: string[];
  require_approval: 'never';
};

export function compileOpenAIMcpTools(
  servers: Record<string, LlmRemoteMcpServerDefinition>,
  allowedTools: string[],
): OpenAIMcpTool[] {
  return Object.values(servers).map((server) => ({
    type: 'mcp',
    server_label: server.name,
    server_url: server.url,
    headers: server.headers,
    allowed_tools: filterAllowedToolsForServer(server, allowedTools),
    require_approval: 'never',
  }));
}

function filterAllowedToolsForServer(
  server: LlmRemoteMcpServerDefinition,
  allowedTools: string[],
): string[] | undefined {
  const bareNames = allowedTools
    .filter((name) => name.startsWith(server.toolNamePrefix))
    .map((name) => name.slice(server.toolNamePrefix.length));

  return bareNames.length > 0 ? bareNames : undefined;
}
