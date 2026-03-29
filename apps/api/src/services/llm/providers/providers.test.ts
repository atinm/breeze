import { describe, expect, it } from 'vitest';
import { OpenAIProvider } from './openaiProvider';
import { LocalProvider } from './localProvider';
import { GeminiProvider } from './geminiProvider';
import { CopilotProvider } from './copilotProvider';
import { createPromptInput } from './testHelpers';

describe('non-claude providers', () => {
  it('OpenAI provider returns a runtime query', () => {
    const provider = new OpenAIProvider({ apiKey: 'test-openai-key' });
    const query = provider.startQuery(createPromptInput());
    expect(query).toEqual(expect.objectContaining({
      interrupt: expect.any(Function),
      close: expect.any(Function),
    }));
  });

  it('OpenAI provider requires API key', () => {
    const provider = new OpenAIProvider();
    expect(() => provider.startQuery(createPromptInput())).toThrow('OPENAI_API_KEY is required for OpenAI provider');
  });

  it('Local provider returns a runtime query', () => {
    const provider = new LocalProvider();
    const query = provider.startQuery(createPromptInput());
    expect(query).toEqual(expect.objectContaining({
      interrupt: expect.any(Function),
      close: expect.any(Function),
    }));
  });

  it('Gemini provider returns a runtime query', () => {
    const provider = new GeminiProvider({ apiKey: 'test-gemini-key' });
    const query = provider.startQuery(createPromptInput());
    expect(query).toEqual(expect.objectContaining({
      interrupt: expect.any(Function),
      close: expect.any(Function),
    }));
  });

  it('Gemini provider requires API key', () => {
    const provider = new GeminiProvider();
    expect(() => provider.startQuery(createPromptInput())).toThrow('GEMINI_API_KEY is required for Gemini provider');
  });

  it('Copilot provider returns a runtime query', () => {
    const provider = new CopilotProvider();
    const query = provider.startQuery(createPromptInput());
    expect(query).toEqual(expect.objectContaining({
      interrupt: expect.any(Function),
      close: expect.any(Function),
    }));
  });
});
