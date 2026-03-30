import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import OrganizationsPage from './OrganizationsPage';
import { fetchWithAuth } from '../../stores/auth';

vi.mock('../../stores/auth', () => ({
  fetchWithAuth: vi.fn(),
}));

vi.mock('@/lib/navigation', () => ({
  navigateTo: vi.fn(),
}));

vi.mock('./OrganizationForm', () => ({ default: () => null }));
vi.mock('./SiteForm', () => ({ default: () => null }));
vi.mock('./SiteList', () => ({
  default: () => <div>Sites list</div>,
}));

const fetchWithAuthMock = vi.mocked(fetchWithAuth);

const makeJsonResponse = (payload: unknown, ok = true, status = ok ? 200 : 500): Response =>
  ({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERROR',
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('OrganizationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads organization details when an org is selected', async () => {
    fetchWithAuthMock.mockImplementation(async (url) => {
      if (url === '/orgs/organizations') {
        return makeJsonResponse({
          data: [
            {
              id: 'org-1',
              name: 'Acme Org',
              status: 'active',
              deviceCount: 3,
              createdAt: '2026-03-01T00:00:00.000Z',
            },
          ],
        });
      }

      if (url === '/orgs/organizations/org-1') {
        return makeJsonResponse({
          id: 'org-1',
          name: 'Acme Org',
          slug: 'acme-org',
          status: 'active',
          type: 'customer',
          contractStart: '2026-01-01T00:00:00.000Z',
          contractEnd: '2026-12-31T00:00:00.000Z',
          settings: {
            defaults: {
              enrollmentSecret: 'org-secret-123',
            },
          },
        });
      }

      if (typeof url === 'string' && url.startsWith('/orgs/sites')) {
        return makeJsonResponse({ data: [] });
      }

      return makeJsonResponse({}, false, 404);
    });

    render(<OrganizationsPage />);

    await screen.findByText('Acme Org');
    fireEvent.click(screen.getByText('Acme Org'));

    await waitFor(() => {
      expect(screen.getByText('acme-org')).not.toBeNull();
      expect(screen.getByText('Agent enrollment secret')).not.toBeNull();
      expect(screen.getByText('Sites list')).not.toBeNull();
    });
  });
});
