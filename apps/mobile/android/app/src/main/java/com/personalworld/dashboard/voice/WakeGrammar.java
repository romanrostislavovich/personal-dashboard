package com.personalworld.dashboard.voice;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;

/**
 * What Vosk listens for. A grammar of the name alone pulls any speech towards it ("Позвони мне"
 * was heard as the name 7 times of 12 in a test on synthesized phrases); with a couple of hundred
 * everyday words beside it the recognizer has something else to choose, and the name is heard
 * only when it is said (12 of 12, no false alarm; 10 of 12 quiet and noisy, with the gain of
 * VoiceService). The name's case endings count too ("Люцифера, …").
 */
public final class WakeGrammar {

    /** Everyday words: the competitors of the name. Words the model lacks are skipped by Vosk. */
    private static final String COMMON =
        "и в не на я он что с а как это по но они к у мы из за вы так же от сказать весь этот который мочь "
            + "человек о один бы такой только себя свой какой когда уже для вот кто да говорить год знать "
            + "мой до или если время рука нет самый ни стать большой даже другой наш ну под где дело "
            + "есть сам раз чтобы два там чем глаз жизнь первый день тут во ничто потом очень со хотеть ли при "
            + "голова надо без видеть идти теперь тоже стоять друг дом сейчас можно после слово здесь думать место "
            + "спросить через лицо тот тогда ведь хороший каждый новый жить должный смотреть почему потому "
            + "сторона просто нога сидеть понять иметь делать вдруг над взять никто сделать дверь перед "
            + "нужный понимать казаться работа три ваш уж земля конец несколько час голос город последний пока "
            + "хорошо давать вода более хотя всегда второй куда пойти стол сила отец женщина машина "
            + "случай ночь мир вид ряд начать утро погода сегодня завтра вчера телефон позвонить звонить мне тебе "
            + "пожалуйста привет спасибо ладно люди люся лиза люба любить лист лица цифра цифры цифр месяц процент "
            + "гулять домой музыка дневник запиши устал сколько какая слушай эй алло окей давай слушаю минута минут полчаса";

    private WakeGrammar() {}

    /** The forms of a name to listen for: the name and its usual case endings. */
    public static List<String> forms(String name) {
        return Arrays.asList(name, name + "а", name + "у", name + "ом", name + "е");
    }

    /** The grammar for Vosk: the forms the model knows, the everyday words, and the unknown. */
    public static String json(List<String> knownForms) {
        Set<String> words = new LinkedHashSet<>(knownForms);
        for (String word : COMMON.split(" ")) {
            if (!word.isEmpty() && !knownForms.contains(word)) {
                words.add(word);
            }
        }
        JSONArray grammar = new JSONArray();
        for (String word : words) {
            grammar.put(word);
        }
        return grammar.put("[unk]").toString();
    }

    /** Whether a recognized text has one of the forms in it, as a word of its own. */
    public static boolean said(String text, List<String> knownForms) {
        for (String word : text.split("\\s+")) {
            if (knownForms.contains(word)) {
                return true;
            }
        }
        return false;
    }
}
