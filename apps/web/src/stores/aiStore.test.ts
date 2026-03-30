import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({
  fetchWithAuth: vi.fn()
}));

import { fetchWithAuth } from './auth';
import { useAiStore } from './aiStore';

const fetchWithAuthMock = vi.mocked(fetchWithAuth);

const makeResponse = (payload: unknown, ok = true, status = ok ? 200 : 500): Response =>
  ({
    ok,
    status,
    json: vi.fn().mockResolvedValue(payload)
  }) as unknown as Response;

describe('ai store', () => {
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
      sessions: [],
      showHistory: false,
      searchResults: [],
      isSearching: false,
      isInterrupting: false
    });
  });

  it('searchConversations short query clears results without request', async () => {
    useAiStore.setState({ searchResults: [{ id: 's1', title: 'old', matchedContent: 'old', createdAt: 'x' }] });

    await useAiStore.getState().searchConversations('a');

    expect(fetchWithAuthMock).not.toHaveBeenCalled();
    expect(useAiStore.getState().searchResults).toEqual([]);
    expect(useAiStore.getState().isSearching).toBe(false);
  });

  it('searchConversations populates results on success', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(
      makeResponse({
        data: [
          {
            id: 'session-1',
            title: 'Patch rollout',
            matchedContent: 'check deployment errors',
            createdAt: '2026-02-07T12:00:00.000Z'
          }
        ]
      })
    );

    await useAiStore.getState().searchConversations('patch');

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/ai/sessions/search?q=patch&limit=20');
    expect(useAiStore.getState().searchResults).toHaveLength(1);
    expect(useAiStore.getState().isSearching).toBe(false);
  });

  it('switchSession loads messages and clears history panel', async () => {
    useAiStore.setState({ showHistory: true });

    fetchWithAuthMock.mockResolvedValueOnce(
      makeResponse({
        session: {
          provider: 'gemini',
          providerModel: 'gemini-2.5-pro',
          flaggedAt: null,
          flagReason: null,
        },
        messages: [
          {
            id: 'm-1',
            role: 'assistant',
            content: 'Done',
            createdAt: '2026-02-07T12:30:00.000Z'
          }
        ]
      })
    );

    await useAiStore.getState().switchSession('session-1');

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/ai/sessions/session-1');
    expect(useAiStore.getState().sessionId).toBe('session-1');
    expect(useAiStore.getState().provider).toBe('gemini');
    expect(useAiStore.getState().providerModel).toBe('gemini-2.5-pro');
    expect(useAiStore.getState().showHistory).toBe(false);
    expect(useAiStore.getState().messages).toHaveLength(1);
    expect(useAiStore.getState().messages[0]?.createdAt).toBeInstanceOf(Date);
  });

  it('sendMessage ignores requests while streaming', async () => {
    useAiStore.setState({ sessionId: 'session-1', isStreaming: true });

    await useAiStore.getState().sendMessage('Hello');

    expect(fetchWithAuthMock).not.toHaveBeenCalled();
    expect(useAiStore.getState().messages).toHaveLength(0);
  });

  it('sendMessage rolls back optimistic message on 409 conflict', async () => {
    useAiStore.setState({ sessionId: 'session-1' });

    fetchWithAuthMock.mockResolvedValueOnce(
      makeResponse(
        { error: 'A message is already being processed for this session' },
        false,
        409
      )
    );

    await useAiStore.getState().sendMessage('Hello');

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/ai/sessions/session-1/messages', {
      method: 'POST',
      body: JSON.stringify({ content: 'Hello', pageContext: undefined })
    });
    expect(useAiStore.getState().messages).toHaveLength(0);
    expect(useAiStore.getState().isStreaming).toBe(false);
    expect(useAiStore.getState().error).toContain('already being processed');
  });

  it('sendMessage processes a final SSE error chunk without a trailing newline', async () => {
    useAiStore.setState({ sessionId: 'session-1' });

    const ssePayload = `data: ${JSON.stringify({
      type: 'error',
      message: 'Quota exceeded for model: gemini-2.5-pro. Please retry in 39s.',
    })}`;

    fetchWithAuthMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(ssePayload));
          controller.close();
        },
      }),
    } as unknown as Response);

    await useAiStore.getState().sendMessage('Hello');

    expect(useAiStore.getState().messages).toHaveLength(1);
    expect(useAiStore.getState().messages[0]).toMatchObject({
      role: 'user',
      content: 'Hello',
    });
    expect(useAiStore.getState().error).toBe(
      'Gemini quota exceeded for gemini-2.5-pro. Check billing or choose a different Gemini model. Retry after 39s.'
    );
  });
});
