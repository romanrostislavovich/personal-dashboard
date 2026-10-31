import {checkBody} from './language-tool.client';
import {LanguageToolGate, MAX_AT_ONCE, REST_MS} from './language-tool.gate';
import {overloaded} from './writing.service';

const REQUEST = {
  text: 'Привет',
  englishVariant: 'en-GB',
  picky: false,
  disabledRules: [],
};

describe('LanguageTool gate', () => {
  it('asks once for the same request while it is with LanguageTool', async () => {
    const gate = new LanguageToolGate<string>();
    let asked = 0;
    const ask = async () => {
      asked++;
      return 'ok';
    };
    await Promise.all([gate.run('a', ask), gate.run('a', ask)]);
    expect(asked).toBe(1);
  });

  it('keeps no more than a few requests with LanguageTool at once', async () => {
    const gate = new LanguageToolGate<number>();
    let now = 0;
    let most = 0;
    const ask = async () => {
      most = Math.max(most, ++now);
      await new Promise(resolve => setTimeout(resolve, 5));
      now--;
      return 1;
    };
    await Promise.all(
      Array.from({length: 10}, (_, i) => gate.run(String(i), ask)),
    );
    expect(most).toBe(MAX_AT_ONCE);
  });

  it('leaves LanguageTool alone for a while after a timeout', async () => {
    let time = 0;
    const gate = new LanguageToolGate<string>(() => time);
    gate.rest();
    await expect(gate.run('a', async () => 'ok')).rejects.toThrow();
    time = REST_MS;
    await expect(gate.run('a', async () => 'ok')).resolves.toBe('ok');
  });

  it('rests on a timeout or a 5xx, not on a wrong request', () => {
    const timeout = new Error('aborted');
    timeout.name = 'TimeoutError';
    expect(overloaded(timeout)).toBe(true);
    expect(overloaded(new Error('LanguageTool 503: overloaded'))).toBe(true);
    expect(overloaded(new Error('LanguageTool 400: bad'))).toBe(false);
  });

  it('tells the English variant only with an automatic language', () => {
    expect(
      checkBody({...REQUEST, language: 'auto'}).get('preferredVariants'),
    ).toBe('en-GB');
    expect(
      checkBody({...REQUEST, language: 'uk-UA'}).has('preferredVariants'),
    ).toBe(false);
  });
});
