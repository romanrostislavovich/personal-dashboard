import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRow } from '../../users/users.schema';
import { BotPhoto } from './bot-command';
import { TelegramBotService } from './telegram-bot.service';

const user = { id: 'user', locale: 'en' } as UserRow;

/** The service without a bot (no token): only its handling of photos is used. */
function service(): TelegramBotService {
  const config = { get: () => undefined };
  const users = { findByTelegramChatId: async () => user };
  const activity = { touched: () => undefined };
  const telegram = new TelegramBotService(
    config as never,
    users as never,
    activity as never,
    {} as never,
  );
  // A file is "downloaded" as its id, so the order of the pages can be told.
  Object.assign(telegram, { downloadFile: async (id: string) => Buffer.from(id) });
  return telegram;
}

/** A photo message, as grammY gives it; `group` — the album it belongs to. */
function photo(fileId: string, group?: string, caption?: string) {
  return {
    chat: { id: 1 },
    message: {
      photo: [{ file_id: `${fileId}-small` }, { file_id: fileId }],
      caption,
      media_group_id: group,
    },
    reply: vi.fn(async () => undefined),
  };
}

const send = (telegram: TelegramBotService, ctx: ReturnType<typeof photo>) =>
  (telegram as unknown as { onPhoto: (ctx: unknown) => Promise<void> }).onPhoto(ctx);

const read = async (photo: BotPhoto) =>
  Promise.all(photo.pages.map(async (page) => (await page.download()).toString()));

describe('Telegram albums', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gives a handler that takes albums whole all the photos at once, in order', async () => {
    const telegram = service();
    const calls: string[][] = [];
    telegram.registerPhotoHandler(
      async (_user, photo) => {
        calls.push(await read(photo));
        return 'kept';
      },
      { id: 'med', label: { en: 'Medical', ru: 'Медицинский' }, wholeAlbum: true },
    );
    // The reply goes under the first photo of the album.
    const first = photo('a', 'album', 'A visit');
    await send(telegram, first);
    await send(telegram, photo('b', 'album'));
    await send(telegram, photo('c', 'album'));
    expect(calls).toEqual([]);

    await vi.advanceTimersByTimeAsync(1_500);
    expect(calls).toEqual([['a', 'b', 'c']]);
    expect(first.reply).toHaveBeenCalledTimes(1);
  });

  it('gives the other handlers the photos one by one, and says the same reply once', async () => {
    const telegram = service();
    const calls: { caption: string; pages: string[] }[] = [];
    telegram.registerPhotoHandler(
      async (_user, photo) => {
        calls.push({ caption: photo.caption, pages: await read(photo) });
        return 'Saved to the diary';
      },
      { id: 'diary', label: { en: 'Diary', ru: 'Дневник' } },
    );
    const first = photo('a', 'album', 'A walk');
    await send(telegram, first);
    await send(telegram, photo('b', 'album'));
    await vi.advanceTimersByTimeAsync(1_500);

    expect(calls).toEqual([
      { caption: 'A walk', pages: ['a'] },
      { caption: '', pages: ['b'] },
    ]);
    expect(first.reply).toHaveBeenCalledWith('Saved to the diary');
    expect(first.reply).toHaveBeenCalledTimes(1);
  });

  it('takes a photo outside an album at once', async () => {
    const telegram = service();
    const handler = vi.fn(async () => 'ok');
    telegram.registerPhotoHandler(handler, { id: 'med', label: { en: 'M', ru: 'М' } });
    await send(telegram, photo('a'));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
