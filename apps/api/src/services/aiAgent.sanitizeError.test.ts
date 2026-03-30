import { describe, expect, it } from 'vitest';
import { sanitizeErrorForClient } from './aiAgent';

describe('sanitizeErrorForClient', () => {
  it('allows Gemini quota errors through to the client', () => {
    const message = '{"error":{"code":429,"message":"Quota exceeded for metric, model: gemini-2.5-pro. Please retry in 39s.","status":"RESOURCE_EXHAUSTED"}}';

    expect(sanitizeErrorForClient(new Error(message))).toBe(message);
  });

  it('allows MCP login prompts through to the client', () => {
    expect(sanitizeErrorForClient(new Error('Not logged in · Please run /login'))).toBe(
      'Not logged in · Please run /login'
    );
  });

  it('allows connection errors through to the client', () => {
    expect(sanitizeErrorForClient(new Error('Connection error.'))).toBe('Connection error.');
  });

  it('keeps unknown internal errors generic', () => {
    expect(sanitizeErrorForClient(new Error('Unhandled provider exception at /private/path'))).toBe(
      'An internal error occurred. Please try again.'
    );
  });
});
