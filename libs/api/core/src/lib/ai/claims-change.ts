/**
 * Does the answer say that data was changed ("recorded", "добавил", "готово"…)?
 * Models sometimes claim a change without calling a tool — especially when earlier turns of the
 * conversation contain such confirmations. The UI languages are English and Russian, so a word
 * list is enough; a false positive only costs one extra model request.
 */
const CLAIM_WORDS = new RegExp(
  String.raw`(?<!\p{L})(` +
    [
      'записал\\p{L}*',
      'добавил\\p{L}*',
      'сохранил\\p{L}*',
      'поставил\\p{L}*',
      'отметил\\p{L}*',
      'внес\\p{L}*',
      'внёс\\p{L}*',
      'удалил\\p{L}*',
      'изменил\\p{L}*',
      'обновил\\p{L}*',
      'исправил\\p{L}*',
      'готово',
      'recorded',
      'saved',
      'added',
      'logged',
      'updated',
      'deleted',
      'removed',
      'changed',
      'done',
    ].join('|') +
    String.raw`)(?!\p{L})`,
  'iu',
);

export function claimsChange(reply: string): boolean {
  return CLAIM_WORDS.test(reply);
}

/** Sent to the model when it claimed a change but called no tool that changes data. */
export const FAKE_CHANGE_CORRECTION =
  'Check your last answer: it says data was changed, but no tool that changes data was called ' +
  'in this turn, so nothing was saved. If I asked for a change, make it now with the tools and ' +
  'then confirm; otherwise answer again without claiming any change.';
