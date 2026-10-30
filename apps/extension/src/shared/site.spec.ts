import {matchesPage, sameSite, siteName, siteOf} from './site';

describe('the site of a page', () => {
  it('joins the subdomains of one site', () => {
    expect(
      sameSite('https://mail.google.com/inbox', 'https://accounts.google.com'),
    ).toBe(true);
    expect(sameSite('https://www.example.co.uk/login', 'example.co.uk')).toBe(
      true,
    );
  });

  it('keeps apart a look-alike, another country domain and shared hosting', () => {
    expect(sameSite('https://google.com.evil.io', 'https://google.com')).toBe(
      false,
    );
    expect(sameSite('https://shop.co.uk', 'https://other.co.uk')).toBe(false);
    expect(sameSite('https://bob.github.io', 'https://alice.github.io')).toBe(
      false,
    );
  });

  it('never gives a login saved for https to an http page', () => {
    expect(sameSite('http://example.com', 'https://example.com')).toBe(false);
    expect(sameSite('https://example.com', 'http://example.com')).toBe(true);
  });

  it('matches an address or localhost only with the same host and port', () => {
    expect(
      sameSite('http://localhost:3300/login', 'http://localhost:3300'),
    ).toBe(true);
    expect(sameSite('http://localhost:4200', 'http://localhost:3300')).toBe(
      false,
    );
    expect(sameSite('http://192.168.1.10', 'http://192.168.1.11')).toBe(false);
  });

  it('reads an address typed without a scheme and refuses what is not a web page', () => {
    expect(siteOf('example.com')?.origin).toBe('https://example.com');
    expect(siteOf('chrome://settings')).toBeNull();
    expect(siteOf('not an address')).toBeNull();
    expect(
      matchesPage(['', 'https://example.com'], 'https://login.example.com'),
    ).toBe(true);
  });

  it('names a site without www', () => {
    expect(siteName('https://www.example.com/login')).toBe('example.com');
  });
});
