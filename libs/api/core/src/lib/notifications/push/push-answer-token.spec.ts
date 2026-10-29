import { configureFieldEncryption } from '../../crypto/encrypted-columns';
import { isPushAnswerToken, pushAnswerToken } from './push.service';

describe('the key of an answer from the shade', () => {
  beforeAll(() => configureFieldEncryption('test-key-test-key-test-key-test-key'));

  it('fits its own notification and no other', () => {
    const one = '6b1f6f53-4d1e-4c55-9a39-1f0a0c8a0001';
    const other = '6b1f6f53-4d1e-4c55-9a39-1f0a0c8a0002';
    const token = pushAnswerToken(one);
    expect(isPushAnswerToken(one, token)).toBe(true);
    expect(isPushAnswerToken(other, token)).toBe(false);
    expect(isPushAnswerToken(one, `${token}x`)).toBe(false);
    expect(isPushAnswerToken(one, '')).toBe(false);
  });
});
