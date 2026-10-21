import { evalEmbed, evalEmbedModel } from '../ai/eval-model';
import { nearest, withTask } from './recall-math';

/*
 * An eval of the embedding model of search by meaning: a question finds the entry it is about
 * even when they share no word, in English and in Russian. Run: npm run ai:eval.
 */

const history = [
  { id: 'dentist', text: 'The dentist put a crown on the upper molar, it should settle in a week' },
  { id: 'knee', text: 'Колено снова болит после пробежки, третий раз за месяц' },
  { id: 'move', text: 'Signed the lease for the new flat, moving on the 1st' },
  { id: 'garden', text: 'Planted tomatoes and basil on the balcony' },
  { id: 'salary', text: 'Got the raise: the new contract starts in November' },
];

async function closest(question: string): Promise<string> {
  const model = evalEmbedModel();
  const vectors = await evalEmbed(history.map((item) => withTask(model, 'document', item.text)));
  const [query] = await evalEmbed([withTask(model, 'query', question)]);
  const items = history.map((item, i) => ({ ...item, vector: vectors[i] }));
  return nearest(query, items, 1, 0)[0].id;
}

describe('search by meaning — the embedding model', () => {
  it('finds what a question is about without a shared word', async () => {
    expect(await closest('When did my tooth hurt?')).toBe('dentist');
    expect(await closest('when did I change apartments')).toBe('move');
    expect(await closest('did my pay go up?')).toBe('salary');
  });

  it('finds across languages: the user writes in Russian and in English', async () => {
    expect(await closest('knee problems after jogging')).toBe('knee');
    expect(await closest('когда у меня болел зуб?')).toBe('dentist');
    expect(await closest('когда я переезжал?')).toBe('move');
  });
});
