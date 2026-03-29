import { describe, expect, it } from 'vitest';
import { createMcpSessionToken, verifyMcpSessionToken } from './mcpSessionAuth';

describe('mcpSessionAuth', () => {
  it('creates and verifies a session MCP token', async () => {
    const token = await createMcpSessionToken({
      sessionId: 'session-123',
      serverName: 'breeze',
    });

    const payload = await verifyMcpSessionToken(token);

    expect(payload).toEqual({
      sessionId: 'session-123',
      serverName: 'breeze',
    });
  });

  it('rejects an invalid token', async () => {
    const payload = await verifyMcpSessionToken('not-a-token');
    expect(payload).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const token = await createMcpSessionToken({
      sessionId: 'session-123',
      serverName: 'breeze',
    });

    const tampered = `${token.slice(0, -2)}xx`;
    const payload = await verifyMcpSessionToken(tampered);

    expect(payload).toBeNull();
  });
});
