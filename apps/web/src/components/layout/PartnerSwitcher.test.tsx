import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PartnerSwitcher from './PartnerSwitcher';
import { useAuthStore } from '../../stores/auth';
import { useOrgStore } from '../../stores/orgStore';

vi.mock('../../stores/auth', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../../stores/orgStore', () => ({
  useOrgStore: vi.fn(),
}));

const useAuthStoreMock = vi.mocked(useAuthStore);
const useOrgStoreMock = vi.mocked(useOrgStore);

describe('PartnerSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads partners and lets a system admin select one', async () => {
    const fetchPartners = vi.fn().mockResolvedValue(undefined);
    const setPartner = vi.fn();

    useAuthStoreMock.mockImplementation((selector) => selector({
      tokens: {
        accessToken: 'header.eyJzY29wZSI6InN5c3RlbSJ9.signature',
      },
    } as never));
    useOrgStoreMock.mockReturnValue({
      currentPartnerId: 'partner-1',
      partners: [
        { id: 'partner-1', name: 'Partner One', status: 'active' },
        { id: 'partner-2', name: 'Partner Two', status: 'active' },
      ],
      isLoading: false,
      setPartner,
      fetchPartners,
    } as never);

    render(<PartnerSwitcher />);

    await waitFor(() => {
      expect(fetchPartners).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTitle('Select Partner'));
    fireEvent.change(screen.getByPlaceholderText('Search partners'), {
      target: { value: 'Two' },
    });
    fireEvent.click(screen.getByRole('option', { name: /Partner Two/i }));

    expect(setPartner).toHaveBeenCalledWith('partner-2');
  });

  it('lets a system admin clear the current selection', async () => {
    const fetchPartners = vi.fn().mockResolvedValue(undefined);
    const setPartner = vi.fn();

    useAuthStoreMock.mockImplementation((selector) => selector({
      tokens: {
        accessToken: 'header.eyJzY29wZSI6InN5c3RlbSJ9.signature',
      },
    } as never));
    useOrgStoreMock.mockReturnValue({
      currentPartnerId: 'partner-1',
      partners: [
        { id: 'partner-1', name: 'Partner One', status: 'active' },
      ],
      isLoading: false,
      setPartner,
      fetchPartners,
    } as never);

    render(<PartnerSwitcher />);

    await waitFor(() => {
      expect(fetchPartners).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTitle('Select Partner'));
    fireEvent.click(screen.getByLabelText('Clear partner selection'));

    expect(setPartner).toHaveBeenCalledWith(null);
  });

  it('does not render for non-system users', () => {
    useAuthStoreMock.mockImplementation((selector) => selector({
      tokens: {
        accessToken: 'header.eyJzY29wZSI6InBhcnRuZXIifQ.signature',
      },
    } as never));
    useOrgStoreMock.mockReturnValue({
      currentPartnerId: null,
      partners: [],
      isLoading: false,
      setPartner: vi.fn(),
      fetchPartners: vi.fn(),
    } as never);

    const { container } = render(<PartnerSwitcher />);

    expect(container.firstChild).toBeNull();
  });
});
