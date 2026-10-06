import { Injector } from '@angular/core';
import { LocalDate } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { DiaryApi } from './diary.api';

/** Today on this device: `YYYY-MM-DD` (the browser is on the user's own clock). */
function today(): LocalDate {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "To the diary: …" — the text goes to the end of today's entry, with the time. */
export async function appendToDiary(text: string, injector: Injector): Promise<void> {
  const api = injector.get(DiaryApi);
  const day = today();
  const entry = await firstValueFrom(api.loadEntry(day));
  const time = new Date().toTimeString().slice(0, 5);
  const content = [entry?.content.trimEnd(), `**${time}** ${text}`].filter(Boolean).join('\n\n');
  await firstValueFrom(api.save(day, { content, mood: entry?.mood ?? null }));
}

/** "A photo for the diary" — a picture (a screenshot) among today's photos. */
export async function photoToDiary(image: File, injector: Injector): Promise<void> {
  await firstValueFrom(injector.get(DiaryApi).uploadPhoto(today(), image));
}
