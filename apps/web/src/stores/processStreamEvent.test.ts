import { describe, expect, it, vi } from 'vitest';
import { processStreamEvent, type StreamableState } from './processStreamEvent';

function createState(overrides: Partial<StreamableState> = {}): StreamableState {
  return {
    messages: [],
    pendingApproval: null,
    pendingPlan: null,
    activePlan: null,
    approvalMode: 'per_step',
    isPaused: false,
    isStreaming: true,
    error: null,
    sessionId: 'session-1',
    sessions: [],
    ...overrides,
  };
}

describe('processStreamEvent', () => {
  it('adds a user-visible assistant error message for stream errors', () => {
    let state = createState();
    const set = (fn: (s: StreamableState) => Partial<StreamableState>) => {
      state = { ...state, ...fn(state) };
    };
    const get = () => state;

    processStreamEvent(
      {
        type: 'error',
        message: 'The provider failed.',
      },
      set,
      get,
      null
    );

    expect(state.isStreaming).toBe(false);
    expect(state.error).toBe('The provider failed.');
    expect(state.messages).toHaveLength(0);
  });

  it('formats Gemini quota errors into a readable message', () => {
    let state = createState();
    const set = (fn: (s: StreamableState) => Partial<StreamableState>) => {
      state = { ...state, ...fn(state) };
    };
    const get = () => state;

    processStreamEvent(
      {
        type: 'error',
        message:
          '{"error":{"code":429,"message":"Quota exceeded for metric, model: gemini-2.5-pro. Please retry in 37s.","status":"RESOURCE_EXHAUSTED"}}',
      },
      set,
      get,
      null
    );

    expect(state.error).toBe(
      'Gemini quota exceeded for gemini-2.5-pro. Check billing or choose a different Gemini model. Retry after 37s.'
    );
    expect(state.messages).toHaveLength(0);
  });

  it('maps MCP login prompts to a readable auth failure message', () => {
    let state = createState();
    const set = (fn: (s: StreamableState) => Partial<StreamableState>) => {
      state = { ...state, ...fn(state) };
    };
    const get = () => state;

    processStreamEvent(
      {
        type: 'error',
        message: 'Not logged in · Please run /login',
      },
      set,
      get,
      null
    );

    expect(state.error).toBe(
      'The AI provider could not authenticate to the MCP server. Check the configured provider and MCP connection settings.'
    );
  });

  it('keeps existing assistant content untouched when a stream error arrives', () => {
    let state = createState({
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Working on it',
          isStreaming: true,
          createdAt: new Date(),
        },
      ],
    });
    const set = (fn: (s: StreamableState) => Partial<StreamableState>) => {
      state = { ...state, ...fn(state) };
    };
    const get = () => state;

    processStreamEvent(
      {
        type: 'error',
        message: 'The provider failed.',
      },
      set,
      get,
      'assistant-1'
    );

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.content).toBe('Working on it');
  });
});
