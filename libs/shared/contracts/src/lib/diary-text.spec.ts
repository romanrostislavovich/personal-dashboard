import { diaryPlainText } from './diary-text';

describe('diaryPlainText', () => {
  it('drops markdown markup but keeps text and mark emoji', () => {
    expect(diaryPlainText('# Day\n**Bold** [link](https://x.y) ==🔥 hot==')).toBe(
      'Day Bold link 🔥 hot',
    );
  });

  it('drops photos, table borders and task checkboxes', () => {
    const content = [
      'Runs:',
      '',
      '| Day | Km |',
      '| --- | -- |',
      '| Mon | 5  |',
      '',
      '![](/api/diary/photos/0b6f7c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b)',
      '',
      '- [x] stretch',
    ].join('\n');
    expect(diaryPlainText(content)).toBe('Runs: Day Km Mon 5 stretch');
  });
});
