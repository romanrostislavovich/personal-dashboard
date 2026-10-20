import {
  ask,
  FillAnswer,
  PageCommand,
  PAGE_HTML_MAX,
  PageHtml,
  PageSnapshot,
  SaveOffer,
} from '../shared/messages';
import {
  fillField,
  fillLogin,
  fillNewPassword,
  passwordFields,
  readSubmitted,
  typedLogin,
} from './forms';
import { closeMenu, fieldById, setupInline } from './inline';
import { showSaveBar } from './save-bar';
import { resetWriting, setupWriting } from './writing/writing';

/*
 * The content script, in every frame of every page. It tells the background about login forms
 * and logins being sent, fills what the background sends, shows the offer to save and the menu
 * under a login field (inline.ts). It never asks for a password: it has no way to.
 */

/** After a form is sent without a reload (a sign-in in a single-page app), ask for the offer. */
const OFFER_DELAY_MS = 1500;

/** A button that is not a form's submit button sends it only when it says so. */
const SEND_HINT = /sign|log ?in|continue|next|submit|войти|вход|далее|продолжить/i;

let lastSent = '';

chrome.runtime.onMessage.addListener(
  (
    command: PageCommand,
    _sender,
    reply: (answer: FillAnswer | PageSnapshot | PageHtml) => void,
  ) => {
    switch (command.type) {
      case 'fill':
        reply({
          filled: fillLogin(
            document,
            command.username,
            command.password,
            command.fieldId ? fieldById(command.fieldId) : null,
          ),
        });
        break;
      case 'fill-new-password': {
        const filled = fillNewPassword(document, command.password);
        reply({ filled, login: typedLogin(document) });
        break;
      }
      case 'fill-field': {
        const field = fieldById(command.fieldId);
        if (field?.isConnected) {
          fillField(field, command.value);
        }
        reply({ filled: !!field?.isConnected });
        break;
      }
      case 'close-menu':
        closeMenu();
        reply({ filled: false });
        break;
      case 'writing-changed':
        resetWriting();
        reply({ filled: false });
        break;
      case 'offer-again':
        reply({ filled: false });
        if (window === window.top) {
          void offerToSave();
        }
        break;
      case 'snapshot':
        // Only the page itself answers, not a frame inside it.
        if (window === window.top) {
          reply(snapshot(command.withText));
        }
        break;
      case 'product':
        if (window === window.top) {
          // Read in the background: the parser stays out of the script of every page.
          reply({ html: document.documentElement.outerHTML.slice(0, PAGE_HTML_MAX) });
        }
        break;
    }
  },
);

// The key icon and the menu in login and sign-up fields.
setupInline();

// Spelling and grammar in the fields one writes in (Writing of the dashboard).
setupWriting();

// A login form now, or one drawn later by the page's own scripts.
watchForLoginForm();

// The form was sent: by the form itself, a click on its button, or Enter.
document.addEventListener('submit', (event) => noteSent(event.target), true);
document.addEventListener(
  'click',
  (event) => {
    const button = (event.target as Element | null)?.closest?.(
      'button, input[type="submit"], [role="button"]',
    );
    if (button && sends(button)) {
      noteSent(button);
    }
  },
  true,
);
document.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      noteSent(event.target);
    }
  },
  true,
);

// Only the page itself shows the bar, not a frame inside it.
if (window === window.top) {
  void offerToSave();
  // The page that sent the form may have been left before the background noted what was sent:
  // asked again a moment later (a page gets an offer once, so it is never shown twice).
  setTimeout(() => void offerToSave(), OFFER_DELAY_MS);
}

function watchForLoginForm(): void {
  if (window !== window.top) {
    return;
  }
  if (passwordFields(document).length) {
    void ask({ type: 'login-form' }).catch(() => undefined);
    return;
  }
  const observer = new MutationObserver(() => {
    if (passwordFields(document).length) {
      observer.disconnect();
      void ask({ type: 'login-form' }).catch(() => undefined);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  // Long-lived pages: stop looking after a minute.
  setTimeout(() => observer.disconnect(), 60_000);
}

function noteSent(target: EventTarget | null): void {
  if (!(target instanceof Element)) {
    return;
  }
  const scope = target.closest('form') ?? document;
  const sent = readSubmitted(scope, document);
  const key = sent ? `${sent.username}\n${sent.password}` : '';
  // The click on a button and the submit it causes are one sending.
  if (!sent || key === lastSent) {
    return;
  }
  lastSent = key;
  void ask({ type: 'submitted', ...sent })
    .then(() => (sent.password && window === window.top ? delay(OFFER_DELAY_MS) : undefined))
    .then(() => {
      // Still on the form with the password in it: the sign-in failed or never went.
      if (
        sent.password &&
        window === window.top &&
        !passwordFields(document).some((input) => input.value === sent.password)
      ) {
        return offerToSave();
      }
      return undefined;
    })
    .catch(() => undefined);
}

/** A submit button, or another one that reads like "Sign in" (not "Show the password"). */
function sends(button: Element): boolean {
  const type = button.getAttribute('type')?.toLowerCase();
  if (
    (button.tagName === 'BUTTON' && type !== 'button' && button.closest('form')) ||
    type === 'submit'
  ) {
    return true;
  }
  return (
    SEND_HINT.test(button.textContent ?? '') ||
    SEND_HINT.test(button.getAttribute('aria-label') ?? '')
  );
}

async function offerToSave(): Promise<void> {
  // The background gives a page the offer once; after that it waits in the popup.
  const offer = await ask<SaveOffer | null>({ type: 'offer' }).catch(() => null);
  if (offer) {
    showSaveBar(offer, {
      save: (mode) => void ask({ type: 'save-offer', mode }).catch(() => undefined),
      dismiss: (never) => void ask({ type: 'dismiss-offer', never }).catch(() => undefined),
      open: () => void ask({ type: 'offer-open' }).catch(() => undefined),
    });
  }
}

/** The page's text cut at this length: enough for an article, never a whole book. */
const SNAPSHOT_TEXT_MAX = 30_000;

/** What the page shows: the selection, and its readable text (the article, or the body). */
function snapshot(withText: boolean): PageSnapshot {
  const selection = (document.getSelection()?.toString() ?? '').trim().slice(0, 5000);
  if (!withText) {
    return { selection, text: null };
  }
  const main = document.querySelector('article, main, [role="main"]') ?? document.body;
  const text = (main instanceof HTMLElement ? main.innerText : (main?.textContent ?? ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, SNAPSHOT_TEXT_MAX);
  return { selection, text };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
