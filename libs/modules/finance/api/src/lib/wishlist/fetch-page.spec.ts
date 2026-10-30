import {readUpTo} from './fetch-page';

describe('readUpTo', () => {
  it('reads a body only as far as the limit', async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new TextEncoder().encode('0123456789'));
      },
    });
    expect(await readUpTo(new Response(body), 25)).toBe(
      '0123456789012345678901234',
    );
    // An endless body: three chunks were enough, the rest was never asked for.
    expect(pulled).toBeLessThanOrEqual(4);
  });

  it('reads a short body whole', async () => {
    expect(await readUpTo(new Response('<html>'), 1000)).toBe('<html>');
  });
});
