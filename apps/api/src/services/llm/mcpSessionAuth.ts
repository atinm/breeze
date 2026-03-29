import { SignJWT, jwtVerify } from 'jose';

const SESSION_MCP_AUDIENCE = 'breeze-mcp-session';
const SESSION_MCP_ISSUER = 'breeze';
const SESSION_MCP_EXPIRY = '15m';

export type McpSessionTokenPayload = {
  sessionId: string;
  serverName: string;
};

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}

export async function createMcpSessionToken(payload: McpSessionTokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_MCP_EXPIRY)
    .setIssuer(SESSION_MCP_ISSUER)
    .setAudience(SESSION_MCP_AUDIENCE)
    .sign(getSecretKey());
}

export async function verifyMcpSessionToken(token: string): Promise<McpSessionTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: SESSION_MCP_ISSUER,
      audience: SESSION_MCP_AUDIENCE,
    });

    if (typeof payload.sessionId !== 'string' || typeof payload.serverName !== 'string') {
      return null;
    }

    return {
      sessionId: payload.sessionId,
      serverName: payload.serverName,
    };
  } catch {
    return null;
  }
}
