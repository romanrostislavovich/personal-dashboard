import { systemPrompt } from './ai-prompt';

const pages = [
  { module: 'finance', path: '/finance', description: 'money' },
  { module: 'projects', path: '/projects/<id>', description: 'one project' },
];

describe('systemPrompt', () => {
  it('tells the pages of the app, so an answer can lead to them', () => {
    const prompt = systemPrompt(undefined, 'Europe/Warsaw', { pages });
    expect(prompt).toContain('/finance — money; /projects/<id> — one project.');
    expect(prompt).toContain('core_project_overview');
  });

  it('keeps links out of plain text (Telegram), but not the tools of the links', () => {
    const prompt = systemPrompt(undefined, 'Europe/Warsaw', { pages, plainText: true });
    expect(prompt).not.toContain('/projects/<id>');
    expect(prompt).toContain('core_mood_insights');
  });
});
