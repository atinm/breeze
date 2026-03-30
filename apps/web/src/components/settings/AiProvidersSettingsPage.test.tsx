import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AiProvidersSettingsPage from './AiProvidersSettingsPage';
import { useAuthStore } from '../../stores/auth';
import { useOrgStore } from '../../stores/orgStore';

vi.mock('../../stores/auth', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../../stores/orgStore', () => ({
  useOrgStore: vi.fn(),
}));

vi.mock('./PartnerAiProvidersTab', () => ({
  default: ({ partnerId }: { partnerId: string }) => <div>provider-tab:{partnerId}</div>,
}));

const useAuthStoreMock = vi.mocked(useAuthStore);
const useOrgStoreMock = vi.mocked(useOrgStore);

describe('AiProvidersSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires partner selection for system admins', () => {
    useAuthStoreMock.mockImplementation((selector) => selector({
      tokens: {
        accessToken: 'header.eyJzY29wZSI6InN5c3RlbSJ9.signature',
      },
    } as never));
    useOrgStoreMock.mockReturnValue({
      currentPartnerId: null,
      partners: [],
      isLoading: false,
    } as never);

    render(<AiProvidersSettingsPage />);

    expect(screen.getByText('No Partner Selected')).not.toBeNull();
  });

  it('renders partner provider settings for partner users', () => {
    useAuthStoreMock.mockImplementation((selector) => selector({
      tokens: {
        accessToken: 'header.eyJzY29wZSI6InBhcnRuZXIifQ.signature',
      },
    } as never));
    useOrgStoreMock.mockReturnValue({
      currentPartnerId: 'partner-1',
      partners: [{ id: 'partner-1', name: 'Partner One', status: 'active' }],
      isLoading: false,
    } as never);

    render(<AiProvidersSettingsPage />);

    expect(screen.getByText('Partner AI Providers')).not.toBeNull();
    expect(screen.getByText(/changes apply to new conversations/i)).not.toBeNull();
    expect(screen.getByText('provider-tab:partner-1')).not.toBeNull();
  });
});
