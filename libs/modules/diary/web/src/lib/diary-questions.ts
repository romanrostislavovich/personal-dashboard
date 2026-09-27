import { LocalDate, parseLocalDate } from '@pd/contracts';

/** Prompts for an empty day. Add more freely — the question of the day rotates by date. */
const QUESTIONS: Record<string, string[]> = {
  en: [
    'What made you smile today?',
    'What are you grateful for today?',
    'What did you learn today?',
    'What drained your energy, and what gave it back?',
    'Which moment of today would you like to remember in a year?',
    'What did you do today that your future self will thank you for?',
    'Who did you enjoy talking to today, and why?',
    'What would you do differently if you lived today again?',
    'What small win are you proud of?',
    'What is on your mind right now?',
    'What are you looking forward to tomorrow?',
    'What surprised you today?',
    'What did you avoid today, and why?',
    'How did you take care of yourself today?',
    'What idea came to you today?',
    'What was the hardest part of the day?',
    'What would make tomorrow a great day?',
    'What did you read, watch or listen to that stuck with you?',
    'Where did you feel most like yourself today?',
    'What are you worried about, and what is in your control?',
  ],
  ru: [
    'Что сегодня вызвало улыбку?',
    'За что ты благодарен сегодня?',
    'Чему ты научился сегодня?',
    'Что сегодня забирало силы, а что их возвращало?',
    'Какой момент дня хочется вспомнить через год?',
    'Что ты сделал сегодня, за что скажешь себе спасибо потом?',
    'С кем было приятно поговорить сегодня и почему?',
    'Что бы ты сделал иначе, если бы прожил этот день заново?',
    'Какой маленькой победой ты гордишься?',
    'Что сейчас крутится в голове?',
    'Чего ты ждёшь от завтра?',
    'Что сегодня удивило?',
    'Что ты сегодня откладывал и почему?',
    'Как ты сегодня позаботился о себе?',
    'Какая идея пришла сегодня?',
    'Что было самым трудным за день?',
    'Что сделает завтрашний день отличным?',
    'Что из прочитанного, увиденного или услышанного запомнилось?',
    'Где ты сегодня чувствовал себя собой больше всего?',
    'Что тревожит и что из этого в твоих силах?',
  ],
};

/** The question for `day`; `shift` moves to the next ones ("another question"). */
export function questionOfTheDay(day: LocalDate, lang: string, shift = 0): string {
  const questions = QUESTIONS[lang] ?? QUESTIONS['en'];
  const { year, month, day: dayOfMonth } = parseLocalDate(day);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, dayOfMonth) / 86_400_000);
  return questions[(dayNumber + shift) % questions.length];
}
