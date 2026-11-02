import {failureMessage} from './wakatime.client';

describe('failureMessage', () => {
  const path = '/users/current/summaries?start=2026-11-02&end=2026-11-02';

  it("adds WakaTime's own reason from a JSON answer", () => {
    expect(failureMessage(403, path, '{"error": "Premium feature."}')).toBe(
      `WakaTime 403: ${path} — Premium feature.`,
    );
    expect(failureMessage(400, path, '{"errors": ["Invalid date"]}')).toBe(
      `WakaTime 400: ${path} — ["Invalid date"]`,
    );
  });

  it('keeps a short text answer and says nothing more for an empty one', () => {
    expect(failureMessage(502, path, '<html>\n Bad   gateway </html>')).toBe(
      `WakaTime 502: ${path} — <html> Bad gateway </html>`,
    );
    expect(failureMessage(403, path, '')).toBe(`WakaTime 403: ${path}`);
  });

  it('cuts a long answer', () => {
    expect(failureMessage(500, path, 'x'.repeat(1000)).length).toBeLessThan(
      path.length + 230,
    );
  });
});
