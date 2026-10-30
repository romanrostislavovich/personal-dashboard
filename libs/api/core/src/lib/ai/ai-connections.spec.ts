import {
  acceptsReasoningEffort,
  hiddenFromShared,
} from './ai-connections.service';

describe('hiddenFromShared', () => {
  it('keeps the modules switched off', () => {
    expect(hiddenFromShared({disabledModules: ['diary']}, 'a')).toEqual([
      'diary',
    ]);
  });

  it('adds a module with a connection of its own', () => {
    expect(
      hiddenFromShared({moduleConnections: {health: 'local'}}, 'cloud'),
    ).toEqual(['health']);
  });

  it('does not hide a module whose own connection is the active one', () => {
    expect(
      hiddenFromShared({moduleConnections: {health: 'local'}}, 'local'),
    ).toEqual([]);
  });

  it('names a module once', () => {
    expect(
      hiddenFromShared(
        {disabledModules: ['health'], moduleConnections: {health: 'local'}},
        'cloud',
      ),
    ).toEqual(['health']);
  });
});

describe('acceptsReasoningEffort', () => {
  it('is sent to the reasoning models of OpenAI', () => {
    expect(acceptsReasoningEffort('openai', 'gpt-6-luna')).toBe(true);
    expect(acceptsReasoningEffort('openai', 'gpt-5.1')).toBe(true);
  });

  it('is not sent to the older ones, which answer 400 to it', () => {
    expect(acceptsReasoningEffort('openai', 'gpt-4o-mini')).toBe(false);
    expect(acceptsReasoningEffort('openai', 'gpt-4.1')).toBe(false);
    expect(acceptsReasoningEffort('openai', 'chatgpt-4o-latest')).toBe(false);
  });

  it('is not sent to other providers at all', () => {
    expect(acceptsReasoningEffort('deepseek', 'deepseek-chat')).toBe(false);
    expect(acceptsReasoningEffort('ollama', 'gpt-6-luna')).toBe(false);
  });
});
