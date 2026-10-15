import { fillLogin, fillNewPassword, findLoginFields, readSubmitted } from './forms';

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
    const doc = page(`<form><input name="user"><input type="password"></form>`);
    const events: string[] = [];
    doc.querySelector('input')?.addEventListener('input', () => events.push('input'));
    expect(fillLogin(doc, 'me@example.com', 'secret')).toBe(true);
    expect(doc.querySelector<HTMLInputElement>('input[name=user]')?.value).toBe('me@example.com');
    expect(doc.querySelector<HTMLInputElement>('input[type=password]')?.value).toBe('secret');
    expect(events).toEqual(['input']);
  });

  it('fills the login alone on the first step of a two-step sign-in', () => {
    const doc = page(`<form><input type="email" name="identifier"></form>`);
    expect(fillLogin(doc, 'me@example.com', 'secret')).toBe(true);
    expect(fillLogin(page(`<form><input name="q"></form>`), 'me', 'secret')).toBe(false);
  });

  it('puts a new password into the new and the repeat fields, not the current one', () => {
    const doc = page(`
      <form>
        <input type="password" autocomplete="current-password" id="current">
        <input type="password" autocomplete="new-password" id="new">
        <input type="password" autocomplete="new-password" id="repeat">
      </form>`);
    expect(fillNewPassword(doc, 'n3w')).toBe(true);
    const value = (id: string) => doc.querySelector<HTMLInputElement>(`#${id}`)?.value;
    expect([value('current'), value('new'), value('repeat')]).toEqual(['', 'n3w', 'n3w']);
  });

  it('reads what is sent: the login and the last password typed', () => {
    const doc = page(`
      <form>
        <input name="user" value="me">
        <input type="password" value="old"><input type="password" value="new">
      </form>`);
    const form = doc.querySelector('form') as HTMLFormElement;
    expect(readSubmitted(form, doc)).toEqual({ username: 'me', password: 'new' });
  });

  it('reads the first step of a two-step sign-in, and nothing from a search form', () => {
    const step = page(`<form><input type="email" value="me@example.com"></form>`);
    expect(readSubmitted(step.querySelector('form') as HTMLFormElement, step)).toEqual({
      username: 'me@example.com',
      password: '',
    });
    const search = page(`<form><input name="q" value="cats"></form>`);
    expect(readSubmitted(search.querySelector('form') as HTMLFormElement, search)).toBeNull();
  });
});
