import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({
  fetchWithAuth: vi.fn(),
  registerOrgIdProvider: vi.fn()
}));

import { fetchWithAuth } from './auth';
import { getCurrentOrganization, useOrgStore } from './orgStore';

const fetchWithAuthMock = vi.mocked(fetchWithAuth);

const makeResponse = (payload: unknown, ok = true, status = ok ? 200 : 500): Response =>
  ({
    ok,
    status,
    json: vi.fn().mockResolvedValue(payload)
  }) as unknown as Response;

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('org store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('breeze-org');
    useOrgStore.setState({
      currentPartnerId: null,
      currentOrgId: null,
      currentSiteId: null,
      partners: [],
      organizations: [],
      sites: [],
      isLoading: false,
      error: null
    });
  });

  it('fetchOrganizations keeps partner scope until an org is explicitly selected', async () => {
    useOrgStore.setState({ currentPartnerId: 'partner-1' });

    fetchWithAuthMock.mockResolvedValueOnce(
      makeResponse({
        data: [{ id: 'org-1', partnerId: 'partner-1', name: 'Org One', status: 'active' }]
      })
    );

    await useOrgStore.getState().fetchOrganizations();
    await flushAsync();

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/orgs/organizations?partnerId=partner-1');
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
    expect(useOrgStore.getState().currentOrgId).toBeNull();
    expect(useOrgStore.getState().sites).toHaveLength(0);
    expect(getCurrentOrganization()).toBeNull();
  });

  it('fetchPartners uses partners route and auto-selects first partner', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(
        makeResponse({
          data: [{ id: 'partner-1', name: 'Partner One', status: 'active' }]
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          data: [{ id: 'org-1', partnerId: 'partner-1', name: 'Org One', status: 'active' }]
        })
      )
      .mockResolvedValueOnce(makeResponse({ data: [] }));

    await useOrgStore.getState().fetchPartners();
    await flushAsync();

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/partners');
    expect(fetchWithAuthMock).toHaveBeenCalledWith('/orgs/organizations?partnerId=partner-1');
    expect(useOrgStore.getState().currentPartnerId).toBe('partner-1');
    expect(useOrgStore.getState().partners).toHaveLength(1);
  });

  it('fetchSites populates helper-selected site', async () => {
    useOrgStore.setState({ currentOrgId: 'org-1', currentSiteId: 'site-1' });

    fetchWithAuthMock.mockResolvedValueOnce(
      makeResponse({
        data: [
          {
            id: 'site-1',
            organizationId: 'org-1',
            name: 'HQ',
            status: 'active',
            deviceCount: 5
          }
        ]
      })
    );

    await useOrgStore.getState().fetchSites();
    await flushAsync();

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/orgs/sites?organizationId=org-1');
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
  });

  it('sets error when organization fetch fails', async () => {
    useOrgStore.setState({ currentPartnerId: 'partner-1' });
    fetchWithAuthMock.mockResolvedValueOnce(makeResponse({ error: 'nope' }, false, 500));

    await useOrgStore.getState().fetchOrganizations();
    await flushAsync();

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/orgs/organizations?partnerId=partner-1');
    expect(useOrgStore.getState().isLoading).toBe(false);
  });

  it('setPartner(null) clears partner, org, and site context', () => {
    useOrgStore.setState({
      currentPartnerId: 'partner-1',
      currentOrgId: 'org-1',
      currentSiteId: 'site-1',
      organizations: [{ id: 'org-1', partnerId: 'partner-1', name: 'Org One', status: 'active', createdAt: '2026-03-29T00:00:00.000Z' }],
      sites: [{ id: 'site-1', organizationId: 'org-1', name: 'HQ', status: 'active', deviceCount: 10, createdAt: '2026-03-29T00:00:00.000Z' }],
    });

    useOrgStore.getState().setPartner(null);

    expect(useOrgStore.getState().currentPartnerId).toBeNull();
    expect(useOrgStore.getState().currentOrgId).toBeNull();
    expect(useOrgStore.getState().currentSiteId).toBeNull();
    expect(useOrgStore.getState().organizations).toHaveLength(0);
    expect(useOrgStore.getState().sites).toHaveLength(0);
  });

  it('setOrganization(null) clears org and site context but keeps partner', () => {
    useOrgStore.setState({
      currentPartnerId: 'partner-1',
      currentOrgId: 'org-1',
      currentSiteId: 'site-1',
      sites: [{ id: 'site-1', organizationId: 'org-1', name: 'HQ', status: 'active', deviceCount: 10, createdAt: '2026-03-29T00:00:00.000Z' }],
    });

    useOrgStore.getState().setOrganization(null);

    expect(useOrgStore.getState().currentPartnerId).toBe('partner-1');
    expect(useOrgStore.getState().currentOrgId).toBeNull();
    expect(useOrgStore.getState().currentSiteId).toBeNull();
    expect(useOrgStore.getState().sites).toHaveLength(0);
  });
});
