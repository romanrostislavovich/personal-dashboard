import { callKey, PendingConfirmations } from './pending-confirmations';

describe('PendingConfirmations', () => {
  const call = callKey('birthdays_delete', { id: 'b1' });

  it('asks first and runs the same call in a later turn', () => {
    const confirmations = new PendingConfirmations();
    expect(confirmations.confirmOrRequest('u1', call, 1)).toBe(false);
    expect(confirmations.confirmOrRequest('u1', call, 2)).toBe(true);
    // Consumed: deleting again needs a new confirmation.
    expect(confirmations.confirmOrRequest('u1', call, 3)).toBe(false);
  });

  it('does not let the model confirm within the same turn', () => {
    const confirmations = new PendingConfirmations();
    confirmations.confirmOrRequest('u1', call, 1);
    expect(confirmations.confirmOrRequest('u1', call, 1)).toBe(false);
  });

  it('confirms only the exact call for the same user', () => {
    const confirmations = new PendingConfirmations();
    confirmations.confirmOrRequest('u1', call, 1);
    expect(confirmations.confirmOrRequest('u1', callKey('birthdays_delete', { id: 'b2' }), 2)).toBe(
      false,
    );
    expect(confirmations.confirmOrRequest('u2', call, 2)).toBe(false);
  });

  it('forgets requests after 10 minutes', () => {
    let now = 0;
    const confirmations = new PendingConfirmations(() => now);
    confirmations.confirmOrRequest('u1', call, 1);
    now = 11 * 60 * 1000;
    expect(confirmations.confirmOrRequest('u1', call, 2)).toBe(false);
  });

  it('ignores the order of arguments', () => {
    expect(callKey('t', { a: 1, b: 2 })).toBe(callKey('t', { b: 2, a: 1 }));
  });
});
