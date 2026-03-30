import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import OrgSettingsPage from './OrgSettingsPage';
import { fetchWithAuth, useAuthStore } from '../../stores/auth';
import { useOrgStore } from '../../stores/orgStore';

vi.mock('../../stores/auth', () => ({
  fetchWithAuth: vi.fn(),
  useAuthStore: vi.fn(),
}));

vi.mock('../../stores/orgStore', () => ({
  useOrgStore: vi.fn(),
}));

vi.mock('./OrgBrandingEditor', () => ({ default: () => null }));
vi.mock('./OrgDefaultsEditor', () => ({ default: () => null }));
vi.mock('./OrgNotificationSettings', () => ({ default: () => null }));
vi.mock('./OrgSecuritySettings', () => ({ default: () => null }));
vi.mock('./OrgEventLogSettings', () => ({ default: () => null }));

const fetchWithAuthMock = vi.mocked(fetchWithAuth);
const useAuthStoreMock = vi.mocked(useAuthStore);
const useOrgStoreMock = vi.mocked(useOrgStore);

const makeJsonResponse = (payload: unknown, ok = true, status = ok ? 200 : 500): Response =>
  ({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERROR',
    json: vi.fn().mockResolvedValue(payload)
  }) as unknown as Response;

describe('OrgSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStoreMock.mockImplementation((selector) => selector({
      tokens: {
        accessToken: 'header.eyJzY29wZSI6InN5c3RlbSJ9.signature',
      },
    } as never));
    useOrgStoreMock.mockReturnValue({
      currentPartnerId: 'partner-1',
      currentOrgId: 'org-1',
      organizations: [{ id: 'org-1', partnerId: 'partner-1', name: 'Org One', status: 'active' }],
      partners: [{ id: 'partner-1', name: 'Partner One', status: 'active' }],
    } as never);
  });

  it('shows the selected partner and organization in the system admin banner', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(makeJsonResponse({
        id: 'org-1',
        name: 'Org One',
        slug: 'org-one',
        status: 'active',
        createdAt: '2026-02-09T00:00:00.000Z',
        settings: {},
      }))
      .mockResolvedValueOnce(makeJsonResponse({ locked: [] }));

    render(<OrgSettingsPage />);

    await screen.findByText('Organization settings');
    expect(screen.getByText('System admin editing organization settings')).not.toBeNull();
    expect(screen.getByText('Partner: Partner One • Organization: Org One')).not.toBeNull();
  });
});
