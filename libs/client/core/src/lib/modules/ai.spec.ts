import {pastedFiles} from './ai';

/** A clipboard with this text and these files. */
const clipboard = (text: string, files: File[]) =>
  ({getData: () => text, files}) as unknown as DataTransfer;

const now = new Date(2026, 9, 19, 14, 5, 9);

describe('pastedFiles', () => {
  it('names pasted pictures by the time', () => {
    const files = pastedFiles(
      clipboard('', [
        new File(['a'], 'image.png', {type: 'image/png'}),
        new File(['b'], 'image.png', {type: 'image/png'}),
        new File(['c'], 'receipt.jpg', {type: 'image/jpeg'}),
        new File(['d'], 'Statement.pdf', {type: 'application/pdf'}),
      ]),
      now,
    );
    expect(files.map(file => file.name)).toEqual([
      'image-14-05-09.png',
      'image-14-05-09-2.png',
      'receipt.jpg',
      'Statement.pdf',
    ]);
    expect(files[0].type).toBe('image/png');
  });

  it('leaves a paste with text to the text field', () => {
    const picture = new File(['a'], 'image.png', {type: 'image/png'});
    expect(pastedFiles(clipboard('Total\t42', [picture]), now)).toEqual([]);
    expect(pastedFiles(null)).toEqual([]);
  });
});
