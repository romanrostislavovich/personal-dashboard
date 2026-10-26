import { VoiceAssistantService } from './voice-assistant.service';

const transcribe = vi.fn();
vi.mock('./openai-compatible.client', () => ({
  transcribe: (...args: unknown[]) => transcribe(...args),
}));

describe('VoiceAssistantService', () => {
  const audio = { data: Buffer.from('RIFF'), fileName: 'voice.wav', mimeType: 'audio/wav' };
  const ask = vi.fn();
  let speech: object | null;
  const make = () =>
    new VoiceAssistantService(
      { isConfigured: async () => true } as never,
      { speech: async () => speech } as never,
      { ask } as never,
      { findById: async () => ({ locale: 'ru' }) } as never,
    );

  beforeEach(() => {
    speech = { baseUrl: 'https://api.openai.com/v1', model: 'whisper-1', apiKey: 'k' };
    transcribe.mockReset();
    ask.mockReset();
  });

  it('asks the assistant what was said, for an answer to be heard', async () => {
    transcribe.mockResolvedValue(' Люцифер, сколько я сегодня сидел в телефоне? ');
    ask.mockResolvedValue({ reply: '📱 Три часа десять минут.', awaitsConfirmation: false });
    const answer = await make().answer('user', audio);
    expect(transcribe.mock.calls[0][2]).toBe('ru');
    expect(ask.mock.calls[0][1]).toEqual({
      content: 'Люцифер, сколько я сегодня сидел в телефоне?',
    });
    expect(ask.mock.calls[0][2]).toMatchObject({
      spoken: true,
      plainText: true,
      allowWrites: true,
    });
    expect(answer).toEqual({
      ok: true,
      question: 'Люцифер, сколько я сегодня сидел в телефоне?',
      answer: 'Три часа десять минут.',
      awaitsConfirmation: false,
    });
  });

  it('says why when it cannot hear', async () => {
    speech = null;
    const answer = await make().answer('user', audio);
    expect(answer.ok).toBe(false);
    expect(answer.answer).toContain('OpenAI');
    expect(ask).not.toHaveBeenCalled();
  });

  it('says that nothing was heard instead of asking an empty question', async () => {
    transcribe.mockResolvedValue('  ');
    const answer = await make().answer('user', audio);
    expect(answer).toMatchObject({ ok: false, question: '' });
    expect(answer.answer).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(ask).not.toHaveBeenCalled();
  });
});
