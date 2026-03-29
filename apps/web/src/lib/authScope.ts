export type AuthScope = 'system' | 'partner' | 'organization';

function decodeBase64Url(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

    if (typeof atob === 'function') {
      return atob(padded);
    }

    if (typeof Buffer !== 'undefined') {
      return Buffer.from(padded, 'base64').toString('utf-8');
    }

    return null;
  } catch {
    return null;
  }
}

export function getAuthScopeFromToken(accessToken: string | null | undefined): AuthScope | null {
  if (!accessToken) return null;

  const parts = accessToken.split('.');
  if (parts.length < 2) return null;

  const payloadJson = decodeBase64Url(parts[1] ?? '');
  if (!payloadJson) return null;

  try {
    const payload = JSON.parse(payloadJson) as { scope?: unknown };
    const scope = payload.scope;
    if (scope === 'system' || scope === 'partner' || scope === 'organization') {
      return scope;
    }
    return null;
  } catch {
    return null;
  }
}

export function isSystemScopeToken(accessToken: string | null | undefined): boolean {
  return getAuthScopeFromToken(accessToken) === 'system';
}
