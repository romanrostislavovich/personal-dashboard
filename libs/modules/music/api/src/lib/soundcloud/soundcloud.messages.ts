import { pickMessages } from '@pd/api-core';
import { SoundcloudNews } from './soundcloud.service';

interface Labels {
  plays: (n: number) => string;
  comments: (n: number) => string;
  followers: (n: number) => string;
}

/** One message for everything a sync found. */
function body(news: SoundcloudNews, t: Labels): string {
  const tracks = news.tracks.map((track) => {
    const lines = [
      track.playsMilestone && `🎉 ${t.plays(track.playsMilestone)}`,
      track.newComments > 0 && `💬 ${t.comments(track.newComments)}`,
    ].filter(Boolean);
    return `${track.title}\n${lines.join('\n')}\n${track.permalinkUrl}`;
  });
  const followers = news.newFollowers > 0 ? [`👥 ${t.followers(news.newFollowers)}`] : [];
  return [...followers, ...tracks].join('\n\n');
}

/** Module notification texts; the language is picked by `user.locale`. */
const messages = {
  en: {
    title: '☁️ SoundCloud',
    body: (news: SoundcloudNews) =>
      body(news, {
        plays: (n) => `${n.toLocaleString('en')} plays!`,
        comments: (n) => `New comments: ${n}`,
        followers: (n) => `New followers: ${n}`,
      }),
  },
  ru: {
    title: '☁️ SoundCloud',
    body: (news: SoundcloudNews) =>
      body(news, {
        plays: (n) => `${n.toLocaleString('ru')} прослушиваний!`,
        comments: (n) => `Новых комментариев: ${n}`,
        followers: (n) => `Новых подписчиков: ${n}`,
      }),
  },
};

export function soundcloudMessages(locale: string) {
  return pickMessages(messages, locale);
}

export function hasNews(news: SoundcloudNews): boolean {
  return news.tracks.length > 0 || news.newFollowers > 0;
}
