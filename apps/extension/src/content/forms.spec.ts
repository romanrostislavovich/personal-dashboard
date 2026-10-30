import {
  classifyField,
  fillLogin,
  fillNewPassword,
  findLoginFields,
  readSubmitted,
  typedLogin,
} from './forms';

function page(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe('login forms', () => {
  it('finds the login named like one before the password, not a search field', () => {
    const doc = page(`
      <input name="q" placeholder="Search">
      <form>
        <input name="nickname">
        <input type="email" name="login">
        <input type="password" name="pass">
      </form>`);
    const fields = findLoginFields(doc);
    expect(fields.username?.name).toBe('login');
    expect(fields.password?.name).toBe('pass');
  });

  it('takes the nearest field when none is named like a login, and skips hidden ones', () => {
    const doc = page(`
      <form>
        <input name="a"><input name="b" style="display:none">
        <input type="password" style="visibility:hidden">
        <input type="password" name="real">
      </form>`);
    const fields = findLoginFields(doc);
    expect(fields.username?.name).toBe('a');
    expect(fields.password?.name).toBe('real');
  });

  it('fills both fields and tells the page, as typing would', () => {
    const doc = page('<form><input name="user"><input type="password"></form>');
    const events: string[] = [];
    doc
      .querySelector('input')
      ?.addEventListener('input', () => events.push('input'));
    expect(fillLogin(doc, 'me@example.com', 'secret')).toBe(true);
    expect(doc.querySelector<HTMLInputElement>('input[name=user]')?.value).toBe(
      'me@example.com',
    );
    expect(
      doc.querySelector<HTMLInputElement>('input[type=password]')?.value,
    ).toBe('secret');
    expect(events).toEqual(['input']);
  });

  it('fills the form of the field the menu was opened for, not the first one of the page', () => {
    const doc = page(`
      <form id="header"><input name="user"><input type="password"></form>
      <form id="dialog"><input type="email" name="login"><input type="password"></form>`);
    const value = (selector: string) =>
      doc.querySelector<HTMLInputElement>(selector)?.value;
    const login = doc.querySelector<HTMLInputElement>('#dialog [name=login]');
    expect(fillLogin(doc, 'me@example.com', 'secret', login)).toBe(true);
    expect([
      value('#dialog [name=login]'),
      value('#dialog [type=password]'),
    ]).toEqual(['me@example.com', 'secret']);
    expect([
      value('#header [name=user]'),
      value('#header [type=password]'),
    ]).toEqual(['', '']);

    const password = doc.querySelector<HTMLInputElement>(
      '#header [type=password]',
    );
    expect(fillLogin(doc, 'you@example.com', 'other', password)).toBe(true);
    expect([
      value('#header [name=user]'),
      value('#header [type=password]'),
    ]).toEqual(['you@example.com', 'other']);
  });

  it('fills the field itself on a first step the guess would miss', () => {
    // No field is named like a login: the guess takes none, the menu's field is the one.
    const doc = page('<input name="q"><form><input name="who"></form>');
    const who = doc.querySelector<HTMLInputElement>('[name=who]');
    expect(fillLogin(doc, 'me@example.com', 'secret', who)).toBe(true);
    expect(who?.value).toBe('me@example.com');
    expect(doc.querySelector<HTMLInputElement>('[name=q]')?.value).toBe('');
  });

  it('fills the login alone on the first step of a two-step sign-in', () => {
    const doc = page('<form><input type="email" name="identifier"></form>');
    expect(fillLogin(doc, 'me@example.com', 'secret')).toBe(true);
    expect(
      fillLogin(page('<form><input name="q"></form>'), 'me', 'secret'),
    ).toBe(false);
  });

  it('puts a new password into the new and the repeat fields, not the current one', () => {
    const doc = page(`
      <form>
        <input type="password" autocomplete="current-password" id="current">
        <input type="password" autocomplete="new-password" id="new">
        <input type="password" autocomplete="new-password" id="repeat">
      </form>`);
    expect(fillNewPassword(doc, 'n3w')).toBe(true);
    const value = (id: string) =>
      doc.querySelector<HTMLInputElement>(`#${id}`)?.value;
    expect([value('current'), value('new'), value('repeat')]).toEqual([
      '',
      'n3w',
      'n3w',
    ]);
  });

  it('reads what is sent: the login and the last password typed', () => {
    const doc = page(`
      <form>
        <input name="user" value="me">
        <input type="password" value="old"><input type="password" value="new">
      </form>`);
    const form = doc.querySelector('form') as HTMLFormElement;
    expect(readSubmitted(form, doc)).toEqual({username: 'me', password: 'new'});
  });

  it('reads the first step of a two-step sign-in, and nothing from a search form', () => {
    const step = page(
      '<form><input type="email" value="me@example.com"></form>',
    );
    expect(
      readSubmitted(step.querySelector('form') as HTMLFormElement, step),
    ).toEqual({
      username: 'me@example.com',
      password: '',
    });
    const search = page('<form><input name="q" value="cats"></form>');
    expect(
      readSubmitted(search.querySelector('form') as HTMLFormElement, search),
    ).toBeNull();
  });

  it('tells a sign-in from a sign-up and a change of password', () => {
    const kind = (doc: Document, selector: string) =>
      classifyField(doc.querySelector(selector) as HTMLInputElement, doc);

    const signIn = page(`
      <input name="q" placeholder="Search">
      <form><input name="email"><input type="password" id="p"><button>Sign in</button></form>`);
    expect([
      kind(signIn, '[name=email]'),
      kind(signIn, '#p'),
      kind(signIn, '[name=q]'),
    ]).toEqual(['username', 'password', null]);

    const signUp = page(`
      <form>
        <input name="fullname"><input type="email" name="email">
        <input type="password" id="a"><input type="password" id="b">
        <button>Create account</button>
      </form>`);
    expect([
      kind(signUp, '[name=fullname]'),
      kind(signUp, '[name=email]'),
      kind(signUp, '#a'),
      kind(signUp, '#b'),
    ]).toEqual([null, 'signup-username', 'new-password', 'new-password']);

    const change = page(`
      <form><input type="password" id="old"><input type="password" id="new"><input type="password" id="again"></form>`);
    expect([
      kind(change, '#old'),
      kind(change, '#new'),
      kind(change, '#again'),
    ]).toEqual(['password', 'new-password', 'new-password']);
  });

  it('knows a sign-up by its button even with one password field', () => {
    const doc = page(
      '<form><input name="login"><input type="password" id="p"><button>Регистрация</button></form>',
    );
    expect(
      classifyField(doc.querySelector('#p') as HTMLInputElement, doc),
    ).toBe('new-password');
    expect(
      classifyField(doc.querySelector('[name=login]') as HTMLInputElement, doc),
    ).toBe('signup-username');
  });

  it('reads the login typed into a sign-up', () => {
    const doc = page(
      '<form><input type="email" value=" me@example.com "><input type="password"></form>',
    );
    expect(typedLogin(doc)).toBe('me@example.com');
  });
});
