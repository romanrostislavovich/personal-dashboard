import { ask, PageCommand, SaveOffer } from '../shared/messages';
import { fillLogin, fillNewPassword, passwordFields, readSubmitted } from './forms';
import { showSaveBar } from './save-bar';

/*
 * The content script, in every frame of every page. It tells the background about login forms
 * and logins being sent, fills what the background sends, and shows the offer to save. It never
 * asks for a password: it has no way to.
 */

/** After a form is sent without a reload (a sign-in in a single-page app), ask for the offer. */
const OFFER_DELAY_MS = 1500;

/** A button that is not a form's submit button sends it only when it says so. */
const SEND_HINT = /sign|log ?in|continue|next|submit|войти|вход|далее|продолжить/i;

let lastSent = '';

chrome.runtime.onMessage.addListener(
  (command: PageCommand, _sender, reply: (answer: { filled: boolean }) => void) => {
    if (command.type === 'fill') {
      reply({ filled: fillLogin(document, command.username, command.password) });
    } else if (command.type === 'fill-new-password') {
      reply({ filled: fillNewPassword(document, command.password) });
    }
  },
);

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
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
