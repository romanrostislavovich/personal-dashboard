import { AiRequestError, transcribe } from './openai-compatible.client';

const connection = {
  baseUrl: 'https://api.openai.com/v1/',
  apiKey: 'sk-test',
  model: 'gpt-4o-mini-transcribe',
};
const voice = { data: Buffer.from('OggS…'), fileName: 'voice.ogg', mimeType: 'audio/ogg' };

describe('transcribe', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the audio, model and language as a form and returns the text', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ text: ' Запиши в дневник: гулял в парке ' })),
      );
    vi.stubGlobal('fetch', fetch);

    expect(await transcribe(connection, voice, 'ru')).toBe('Запиши в дневник: гулял в парке');

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(init.headers).toEqual({ Authorization: 'Bearer sk-test' });
    const form = init.body as FormData;
    expect(form.get('model')).toBe('gpt-4o-mini-transcribe');
    expect(form.get('language')).toBe('ru');
    expect((form.get('file') as File).name).toBe('voice.ogg');
  });

  it('reports a rejected request with its status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no key', { status: 401 })));
    await expect(transcribe(connection, voice)).rejects.toEqual(new AiRequestError('no key', 401));
  });
});
