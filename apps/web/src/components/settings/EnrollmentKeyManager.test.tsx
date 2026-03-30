import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as authStore from '../../stores/auth';
import { useOrgStore } from '../../stores/orgStore';
import EnrollmentKeyManager from './EnrollmentKeyManager';

vi.mock('@/lib/navigation', () => ({
  navigateTo: vi.fn(),
}));

const fetchWithAuthMock = vi.spyOn(authStore, 'fetchWithAuth');

const makeJsonResponse = (payload: unknown, ok = true, status = ok ? 200 : 500): Response =>
  ({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERROR',
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

function makeAccessToken(scope: 'system' | 'partner' | 'organization'): string {
  const payload = btoa(JSON.stringify({ scope })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `header.${payload}.signature`;
}

describe('EnrollmentKeyManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('breeze-org');
    authStore.useAuthStore.setState({
      user: null,
      tokens: { accessToken: makeAccessToken('system'), expiresInSeconds: 3600 },
      isAuthenticated: true,
      isLoading: false,
      mfaPending: false,
      mfaTempToken: null,
    });
    useOrgStore.setState({
      currentPartnerId: 'partner-1',
      currentOrgId: 'org-1',
      currentSiteId: null,
      partners: [{ id: 'partner-1', name: 'Partner One', status: 'active', createdAt: '2026-03-29T00:00:00.000Z' }],
      organizations: [{ id: 'org-1', partnerId: 'partner-1', name: 'Org One', status: 'active', createdAt: '2026-03-29T00:00:00.000Z' }],
      sites: [{ id: 'site-1', organizationId: 'org-1', name: 'HQ', status: 'active', deviceCount: 2, createdAt: '2026-03-29T00:00:00.000Z' }],
      isLoading: false,
      error: null,
    });
  });

  it('requires an explicit site before allowing key creation', async () => {
    fetchWithAuthMock.mockImplementation(async (url, options) => {
      if (typeof url === 'string' && url.startsWith('/enrollment-keys?')) {
        return makeJsonResponse({ data: [], pagination: { page: 1, limit: 50, total: 0 } });
      }

      if (url === '/partners') {
        return makeJsonResponse({
          data: [{ id: 'partner-1', name: 'Partner One', status: 'active', createdAt: '2026-03-29T00:00:00.000Z' }],
        });
      }

      if (url === '/orgs/organizations?partnerId=partner-1') {
        return makeJsonResponse({
          data: [{ id: 'org-1', partnerId: 'partner-1', name: 'Org One', status: 'active', createdAt: '2026-03-29T00:00:00.000Z' }],
        });
      }

      if (url === '/orgs/sites?organizationId=org-1') {
        return makeJsonResponse({
          data: [{ id: 'site-1', organizationId: 'org-1', name: 'HQ', status: 'active', deviceCount: 2, createdAt: '2026-03-29T00:00:00.000Z' }],
        });
      }

      if (url === '/enrollment-keys' && options?.method === 'POST') {
        return makeJsonResponse({
          id: 'key-1',
          orgId: 'org-1',
          siteId: 'site-1',
          name: 'HQ key',
          key: 'plain-key',
        });
      }

      return makeJsonResponse({}, false, 404);
    });

    render(<EnrollmentKeyManager />);

    const createButton = await screen.findByRole('button', { name: 'Create Key' });
    expect(createButton.hasAttribute('disabled')).toBe(true);

    await act(async () => {
      useOrgStore.getState().setSite('site-1');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Key' }).hasAttribute('disabled')).toBe(false);
    });
  });

  it('posts the selected organization and site when creating a key', async () => {
    fetchWithAuthMock.mockImplementation(async (url, options) => {
      if (typeof url === 'string' && url.startsWith('/enrollment-keys?')) {
        return makeJsonResponse({ data: [], pagination: { page: 1, limit: 50, total: 0 } });
      }

      if (url === '/partners') {
        return makeJsonResponse({
          data: [{ id: 'partner-1', name: 'Partner One', status: 'active', createdAt: '2026-03-29T00:00:00.000Z' }],
        });
      }

      if (url === '/orgs/organizations?partnerId=partner-1') {
        return makeJsonResponse({
          data: [{ id: 'org-1', partnerId: 'partner-1', name: 'Org One', status: 'active', createdAt: '2026-03-29T00:00:00.000Z' }],
        });
      }

      if (url === '/orgs/sites?organizationId=org-1') {
        return makeJsonResponse({
          data: [{ id: 'site-1', organizationId: 'org-1', name: 'HQ', status: 'active', deviceCount: 2, createdAt: '2026-03-29T00:00:00.000Z' }],
        });
      }

      if (url === '/enrollment-keys' && options?.method === 'POST') {
        const body = JSON.parse(String(options.body));
        expect(body).toMatchObject({
          name: 'HQ enrollment',
          orgId: 'org-1',
          siteId: 'site-1',
        });

        return makeJsonResponse({
          id: 'key-1',
          orgId: 'org-1',
          siteId: 'site-1',
          name: 'HQ enrollment',
          key: 'plain-key',
          usageCount: 0,
          maxUsage: 1,
          expiresAt: null,
          createdAt: '2026-03-29T00:00:00.000Z',
        });
      }

      return makeJsonResponse({}, false, 404);
    });

    useOrgStore.setState({ currentSiteId: 'site-1' });

    render(<EnrollmentKeyManager />);

    fireEvent.click(await screen.findByRole('button', { name: 'Create Key' }));
    fireEvent.change(screen.getByPlaceholderText('e.g., Production servers'), { target: { value: 'HQ enrollment' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Create Key' })[1] as HTMLButtonElement);

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/enrollment-keys',
        expect.objectContaining({ method: 'POST', body: expect.any(String) })
      );
    });
  });
});
