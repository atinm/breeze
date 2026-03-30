import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PartnerAdminPage from './PartnerAdminPage';
import { fetchWithAuth } from '../../stores/auth';

vi.mock('../../stores/auth', () => ({
  fetchWithAuth: vi.fn(),
}));

vi.mock('../auth/SystemAdminGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const fetchWithAuthMock = vi.mocked(fetchWithAuth);

const makeJsonResponse = (payload: unknown, ok = true, status = ok ? 200 : 500): Response =>
  ({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERROR',
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('PartnerAdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with no partner selected and opens an empty create form', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeJsonResponse({
      data: [
        {
          id: 'partner-1',
          name: 'Acme MSP',
          slug: 'acme',
          type: 'msp',
          plan: 'pro',
          status: 'active',
          billingEmail: null,
          maxOrganizations: null,
          settings: {},
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z',
        },
      ],
    }));

    render(<PartnerAdminPage />);

    await screen.findByText('Select a partner');
    expect(screen.getByText('Acme MSP')).not.toBeNull();

    fireEvent.click(screen.getByText('Create Partner'));

    expect(screen.getByText('Fill out the new partner record. The form starts empty by design.')).not.toBeNull();
    const nameInput = screen.getAllByLabelText('Name')[0] as HTMLInputElement;
    expect(nameInput.value).toBe('');
  });

  it('filters the partner list and shows details only after selection', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeJsonResponse({
      data: [
        {
          id: 'partner-1',
          name: 'Acme MSP',
          slug: 'acme',
          type: 'msp',
          plan: 'pro',
          status: 'active',
          billingEmail: null,
          maxOrganizations: null,
          settings: {},
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z',
        },
        {
          id: 'partner-2',
          name: 'Zen Internal',
          slug: 'zen',
          type: 'internal',
          plan: 'enterprise',
          status: 'active',
          billingEmail: null,
          maxOrganizations: null,
          settings: {},
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z',
        },
      ],
    }));

    render(<PartnerAdminPage />);

    await screen.findByText('Select a partner');

    fireEvent.change(screen.getByPlaceholderText('Search partners by name, slug, or type'), {
      target: { value: 'zen' },
    });

    expect(screen.queryByText('Acme MSP')).toBeNull();
    expect(screen.getByText('Zen Internal')).not.toBeNull();

    fireEvent.click(screen.getByText('Zen Internal'));

    await waitFor(() => {
      expect(screen.getByText('Plan: enterprise')).not.toBeNull();
    });
    expect(screen.getByRole('button', { name: 'Delete Partner' })).not.toBeNull();
  });

  it('uses the top searchable partner combobox', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeJsonResponse({
      data: [
        {
          id: 'partner-1',
          name: 'Acme MSP',
          slug: 'acme',
          type: 'msp',
          plan: 'pro',
          status: 'active',
          billingEmail: null,
          maxOrganizations: null,
          settings: {},
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z',
        },
        {
          id: 'partner-2',
          name: 'Zen Internal',
          slug: 'zen',
          type: 'internal',
          plan: 'enterprise',
          status: 'active',
          billingEmail: null,
          maxOrganizations: null,
          settings: {},
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z',
        },
      ],
    }));

    render(<PartnerAdminPage />);

    await screen.findByText('Select a partner');

    fireEvent.click(screen.getByTitle('Selected Partner'));
    fireEvent.change(screen.getByPlaceholderText('Search partners'), {
      target: { value: 'acme' },
    });
    fireEvent.click(screen.getByRole('option', { name: /Acme MSP/i }));

    await waitFor(() => {
      expect(screen.getByText('Plan: pro')).not.toBeNull();
    });
  });
});
