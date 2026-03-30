import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PartnerAiProvidersTab from './PartnerAiProvidersTab';
import { fetchWithAuth } from '../../stores/auth';
import { useAiStore } from '../../stores/aiStore';

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
    useAiStore.setState({
      isOpen: false,
      sessionId: null,
      provider: null,
      providerModel: null,
      messages: [],
      isStreaming: false,
      isLoading: false,
      error: null,
      pageContext: null,
      pendingApproval: null,
      pendingPlan: null,
      activePlan: null,
      approvalMode: 'per_step',
      isPaused: false,
      sessions: [],
      showHistory: false,
      searchResults: [],
      isSearching: false,
      isInterrupting: false,
      isFlagged: false,
      flagReason: null,
    });
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

  it('only keeps one provider enabled in the form at a time', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(makeJsonResponse({
      data: [
        { provider: 'gemini', enabled: true, defaultModel: 'gemini-2.5-pro', allowedModels: ['gemini-2.5-pro'], endpoint: null, apiKeyRef: null },
        { provider: 'openai', enabled: false, defaultModel: 'gpt-4.1', allowedModels: ['gpt-4.1'], endpoint: null, apiKeyRef: null },
      ],
    }));

    render(<PartnerAiProvidersTab partnerId="partner-1" />);

    await screen.findByText('Gemini');

    const geminiSection = screen.getByText('Gemini').closest('section');
    const openAiSection = screen.getByText('OpenAI').closest('section');
    if (!geminiSection || !openAiSection) throw new Error('Provider sections missing');

    const geminiEnabled = geminiSection.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    const openAiEnabled = openAiSection.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (!geminiEnabled || !openAiEnabled) throw new Error('Provider toggles missing');

    expect(geminiEnabled.checked).toBe(true);
    expect(openAiEnabled.checked).toBe(false);

    fireEvent.click(openAiEnabled);

    expect(openAiEnabled.checked).toBe(true);
    expect(geminiEnabled.checked).toBe(false);
  });

  it('restarts the AI conversation after saving provider settings when a session exists', async () => {
    useAiStore.setState({ isOpen: true, sessionId: 'session-1' });

    fetchWithAuthMock
      .mockResolvedValueOnce(makeJsonResponse({
        data: [
          { provider: 'gemini', enabled: true, defaultModel: 'gemini-2.5-pro', allowedModels: ['gemini-2.5-pro'], endpoint: null, apiKeyRef: null },
        ],
      }))
      .mockResolvedValueOnce(makeJsonResponse({ success: true }))
      .mockResolvedValueOnce(makeJsonResponse({ success: true }))
      .mockResolvedValueOnce(makeJsonResponse({
        id: 'session-2',
        provider: 'gemini',
        providerModel: 'gemini-2.5-pro',
      }, true, 201));

    render(<PartnerAiProvidersTab partnerId="partner-1" />);

    await screen.findByText('Gemini');

    const geminiSection = screen.getByText('Gemini').closest('section');
    if (!geminiSection) throw new Error('Gemini section missing');
    const saveButton = geminiSection.querySelector('button');
    if (!saveButton) throw new Error('Save button missing');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenCalledWith('/ai/sessions/session-1', { method: 'DELETE' });
      expect(fetchWithAuthMock).toHaveBeenCalledWith('/ai/sessions', {
        method: 'POST',
        body: JSON.stringify({ pageContext: undefined })
      });
    });

    expect(useAiStore.getState().sessionId).toBe('session-2');
    expect(useAiStore.getState().provider).toBe('gemini');
  });
});
