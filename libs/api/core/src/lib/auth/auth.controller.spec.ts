import {UnauthorizedException} from '@nestjs/common';
import {AuthController} from './auth.controller';

describe('AuthController, the refresh cookie', () => {
  const refresh = vi.fn();
  const logout = vi.fn();
  const controller = new AuthController(
    {refresh, logout} as never,
    {} as never,
    {} as never,
  );
  const request = (cookie: string) =>
    ({headers: {cookie}, secure: true}) as never;
  const response = () => ({cookie: vi.fn(), clearCookie: vi.fn()});

  beforeEach(() => {
    refresh.mockReset();
    logout.mockReset();
  });

  it('leaves the cookie alone when an old token is refused', async () => {
    // A second window asked with the token of before; the new session's cookie must survive it.
    refresh.mockRejectedValue(new UnauthorizedException());
    const answer = response();
    await expect(
      controller.refresh({}, request('pd_refresh=old'), answer as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(answer.clearCookie).not.toHaveBeenCalled();
    expect(answer.cookie).not.toHaveBeenCalled();
  });

  it('leaves it alone when the server fails for another reason too', async () => {
    refresh.mockRejectedValue(new Error('the database restarts'));
    const answer = response();
    await expect(
      controller.refresh({}, request('pd_refresh=good'), answer as never),
    ).rejects.toThrow();
    expect(answer.clearCookie).not.toHaveBeenCalled();
  });

  it('clears it on signing out', async () => {
    const answer = response();
    await controller.logout({}, request('pd_refresh=good'), answer as never);
    expect(logout).toHaveBeenCalledWith('good');
    expect(answer.clearCookie).toHaveBeenCalledWith(
      'pd_refresh',
      expect.objectContaining({path: '/api/auth'}),
    );
  });
});
