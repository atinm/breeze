import { describe, expect, it } from 'vitest';
import { getAuthScopeFromToken, isSystemScopeToken } from './authScope';

function makeToken(payload: Record<string, unknown>): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode(header)}.${encode(payload)}.signature`;
}

describe('authScope', () => {
  it('extracts system scope from access token', () => {
    const token = makeToken({ sub: 'user-1', scope: 'system' });
    expect(getAuthScopeFromToken(token)).toBe('system');
    expect(isSystemScopeToken(token)).toBe(true);
  });

  it('returns null for missing or malformed tokens', () => {
    expect(getAuthScopeFromToken(null)).toBeNull();
    expect(getAuthScopeFromToken('not-a-jwt')).toBeNull();
    expect(getAuthScopeFromToken(makeToken({ sub: 'user-1' }))).toBeNull();
  });

  it('returns false for non-system scopes', () => {
    const token = makeToken({ sub: 'user-2', scope: 'partner' });
    expect(getAuthScopeFromToken(token)).toBe('partner');
    expect(isSystemScopeToken(token)).toBe(false);
  });
});
