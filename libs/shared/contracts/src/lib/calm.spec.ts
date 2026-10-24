import { quietMinutesLeft } from './calm';

describe('quiet hours', () => {
  const night = { from: '21:00', to: '09:00' };
  const at = (clock: string) => {
    const [h, m] = clock.split(':').map(Number);
    return h * 60 + m;
  };

  it('counts what is left of hours that cross midnight', () => {
    expect(quietMinutesLeft(night, at('21:00'))).toBe(12 * 60);
    expect(quietMinutesLeft(night, at('23:30'))).toBe(9 * 60 + 30);
    expect(quietMinutesLeft(night, at('08:59'))).toBe(1);
  });

  it('is not quiet outside them, nor without them', () => {
    expect(quietMinutesLeft(night, at('09:00'))).toBe(0);
    expect(quietMinutesLeft(night, at('20:59'))).toBe(0);
    expect(quietMinutesLeft(null, at('23:00'))).toBe(0);
  });

  it('works within one day too', () => {
    expect(quietMinutesLeft({ from: '13:00', to: '14:00' }, at('13:15'))).toBe(45);
    expect(quietMinutesLeft({ from: '13:00', to: '14:00' }, at('14:00'))).toBe(0);
  });
});
