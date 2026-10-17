# Browser extension (Chrome)

The dashboard in the browser: the spelling and grammar of what you type (as Grammarly), the
password vault — it fills logins, offers to save the ones you type and makes strong passwords —
and the assistant beside the page. It talks to your own dashboard; the vault is opened here with
the master password, so the server still sees only ciphertext.

## Install

The extension is installed by hand, not from the Chrome Web Store. **Settings → Apps** of the
dashboard has it, and the steps:

- **With the desktop app on the computer** (Settings → Apps opened inside the app): the app keeps
  the extension in a folder of its own (`%APPDATA%/Personal Dashboard/browser-extension`) and
  shows it. In `chrome://extensions` turn on **Developer mode**, **Load unpacked** → that folder.
  It then **updates itself**: the app brings every new version from the server into the folder
  (every 2 hours, as its own code), and the extension reloads with the new files within 30
  minutes — not while its popup is open. The vault is unlocked again after an update.
- **Without it**: download the zip, unzip it into a folder that stays, load it the same way.
  It does not update itself then: when the server has had a newer version for 3 hours, the
  popup says so, and the new zip is loaded the same way.

Then pin it to the toolbar (the puzzle icon → the pin), click it, and sign in: the dashboard's
address (`https://…`), your email and password, then the code if two-factor sign-in is on.
The popup opens on the check of the writing on the page in front, the vault and the tools; the
master password is asked only when a login is wanted (**Logins**, the key in a login field, or
`Ctrl+Shift+L`). The vault itself is created on the dashboard (Passwords), where the recovery
key is shown. Edge, Brave and other Chromium browsers load it the same way.

For development: `npx nx build extension` → load `dist/apps/extension`, and press the reload
arrow in `chrome://extensions` after a build.

## What it does

- **Writing, as Grammarly.** A field you write in gets a badge in its corner as soon as it has
  the focus. After a pause the text is checked by LanguageTool on your server: mistakes are
  underlined (red — spelling, yellow — grammar…), a click on one opens its fixes, and the badge
  shows their number. The badge opens the panel of the field: the mistakes in a list, **Fix
  all**, the AI's rewrites of the whole text (shorter, politer…), **Not on this site**. The
  popup switches the check on or off for the site in front. Passwords, logins, search boxes
  and code editors are never checked; the text goes nowhere but your own server.
- **In the fields themselves.** A login or password field of a sign-in gets a key icon, and
  the menu under it lists the logins of the site — a click fills the form. In a sign-up the
  password field offers **Use a strong password**: both fields are filled and the login is
  saved to the vault at once (sending the form adds the login typed in it), and the email or
  login field suggests the ones you use most. With the vault locked the icon stays and its
  menu unlocks it. Typing into the field or Esc closes the menu. The menu is a page of the
  extension in a frame: the site cannot read what it lists, and a press counts only when the
  browser says the menu is fully in sight (so a site cannot cover it to steal a click).

- **Fill.** The logins of the open page are on top of the list (and their number is on the
  icon); **Fill** puts the login and the password into the page. `Ctrl+Shift+L` fills the first
  login of the page without opening the popup. A login of another site is filled only after a
  warning: a page that looks like your bank but is not is how phishing works.
- **Save.** When a form with a password is sent, the next page shows a bar: _Save the password
  for example.com?_ — or _Update_ when the login is known and the password changed. _Never for
  this site_ is undone under **Ignored sites** in the popup. A sign-in in two steps (the login,
  then the password) is put together.
- **Generate.** The key button: a password from the device's random source, with the length and
  the kinds of characters you choose; **Fill into the page** puts it into the fields for a new
  password (both, when it is asked twice).
- **Lock.** After 10 minutes without use, when the computer is locked, with the lock button, and
  when Chrome closes.

## How it keeps the vault

| What                         | Where                                                           |
| ---------------------------- | --------------------------------------------------------------- |
| the dashboard's address      | `chrome.storage.local` (disk)                                   |
| the refresh token, the email | `chrome.storage.local` (disk), as the desktop app keeps its own |
| the access token (15 min)    | `chrome.storage.session` — memory, gone when Chrome closes      |
| the open vault key           | `chrome.storage.session` — only while unlocked                  |
| a login waiting to be saved  | `chrome.storage.session`, for 5 minutes                         |
| the master password          | nowhere: it opens the key and is forgotten                      |

Session storage is readable by the extension's own pages and its service worker, never by the
content scripts that run inside web pages. The service worker sleeps after 30 seconds and keeps
the open key there meanwhile (`restoreVaultKey` of the client core).

The content script asks only about its own tab and can never ask for a password; the background
decides what to fill, and sends a password only to the frames of the page that are on the
login's site (`src/background/fill.ts`). A login saved for https is never filled into an http
page. Which sites are one is decided by the registrable domain (`src/shared/site.ts`).

## Known limits

- A copied password stays in the clipboard until something else is copied.
- Sites are matched without the full Public Suffix List: the last two labels of the host, or
  three under country second levels (`co.uk`) and shared hosting (`github.io`).
- The bar to save is shown by the page itself, not by a login form inside a frame of another
  site; such a login is offered in the popup.

## Code

| Folder            | What                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `src/background/` | the service worker: the session, the open vault, filling, saving offers |
| `src/content/`    | in every page: login forms (`forms.ts`), the save bar                   |
| `src/popup/`      | the popup, plain DOM                                                    |
| `src/shared/`     | the messages between them, which sites match                            |
| `build.mjs`       | esbuild into `dist/apps/extension`                                      |

Every request and the cryptography come from the client core (`@pd/client-core`), as in the web
app. Texts are in `src/_locales/{en,ru}/messages.json` (Chrome picks the browser's language).
