import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mobileApk} from './app-files';

describe('the Android app a server keeps', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'apk-'));
  });
  afterEach(() => rmSync(dir, {recursive: true, force: true}));

  it('is offered with its version and size', () => {
    writeFileSync(join(dir, 'personal-dashboard.apk'), 'apk');
    writeFileSync(
      join(dir, 'apk.json'),
      JSON.stringify({
        key: 'k',
        version: '0.3.0.512',
        file: 'personal-dashboard.apk',
      }),
    );
    expect(mobileApk(dir)).toEqual({
      version: '0.3.0.512',
      downloads: [
        {
          platform: 'android',
          url: '/downloads/mobile/personal-dashboard.apk',
          size: 3,
          external: false,
        },
      ],
    });
  });

  it('is not offered without the file, the list or the folder', () => {
    writeFileSync(
      join(dir, 'apk.json'),
      JSON.stringify({version: '1', file: 'gone.apk'}),
    );
    const none = {version: null, downloads: []};
    expect(mobileApk(dir)).toEqual(none);
    expect(mobileApk(join(dir, 'missing'))).toEqual(none);
    expect(mobileApk(undefined)).toEqual(none);
  });
});
