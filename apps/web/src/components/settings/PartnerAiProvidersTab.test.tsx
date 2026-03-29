import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PartnerAiProvidersTab from './PartnerAiProvidersTab';
import { fetchWithAuth } from '../../stores/auth';

vi.mock('../../stores/auth', () => ({
  fetchWithAuth: vi.fn(),
}));

vi.mock('../shared/Toast', () => ({
  showToast: vi.fn(),
}));

const fetchWithAuthMock = vi.mocked(fetchWithAuth);

const makeJsonResponse = (payload: unknown, ok = true, status = ok ? 200 : 500): Response =>
  ({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERROR',
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('PartnerAiProvidersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads provider config with partnerId and updates a provider', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(makeJsonResponse({
        data: [
          { provider: 'gemini', enabled: true, defaultModel: 'gemini-2.5-pro', allowedModels: ['gemini-2.5-pro'], endpoint: null, apiKeyRef: null },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({ success: true }));

    render(<PartnerAiProvidersTab partnerId="partner-1" />);

    await screen.findByText('Gemini');
    expect(fetchWithAuthMock).toHaveBeenCalledWith('/ai/provider-configs?partnerId=partner-1');

    const inputs = screen.getAllByPlaceholderText('gemini-2.5-pro');
    const modelInput = inputs[0] as HTMLInputElement;
    fireEvent.change(modelInput, { target: { value: 'gemini-2.5-flash' } });

    const geminiSection = screen.getByText('Gemini').closest('section');
    if (!geminiSection) throw new Error('Gemini section missing');
    const saveButton = geminiSection.querySelector('button');
    if (!saveButton) throw new Error('Save button missing');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/ai/provider-configs/gemini?partnerId=partner-1',
        expect.objectContaining({ method: 'PUT' }),
      );
    });
  });
});
