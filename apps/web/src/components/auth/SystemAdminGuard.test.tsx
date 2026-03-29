import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SystemAdminGuard from './SystemAdminGuard';

const mockUseAuthStore = vi.fn();

vi.mock('../../stores/auth', () => ({
  useAuthStore: (selector: (state: { tokens: { accessToken?: string } | null }) => unknown) =>
    selector(mockUseAuthStore()),
}));

function makeToken(scope: 'system' | 'partner' | 'organization'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'user-1', scope })).toString('base64url');
  return `${header}.${payload}.sig`;
}

describe('SystemAdminGuard', () => {
  it('renders children for system scope token', () => {
    mockUseAuthStore.mockReturnValue({ tokens: { accessToken: makeToken('system') } });

    render(
      <SystemAdminGuard>
        <div>secret admin content</div>
      </SystemAdminGuard>,
    );

    expect(screen.getByText('secret admin content')).toBeDefined();
  });

  it('shows access denied state for non-system token', () => {
    mockUseAuthStore.mockReturnValue({ tokens: { accessToken: makeToken('partner') } });

    render(
      <SystemAdminGuard>
        <div>secret admin content</div>
      </SystemAdminGuard>,
    );

    expect(screen.getByText('System admin access required')).toBeDefined();
  });
});
