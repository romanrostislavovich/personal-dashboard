import {expect, test} from '@playwright/test';
import {newAccount, signIn} from './account';

test('a diary entry is saved as it is typed and is there after a reload', async ({
  page,
  request,
}) => {
  await signIn(page, await newAccount(request));
  await page.goto('/diary');

  const words = `A walk by the river, ${Date.now()}`;
  const editor = page.locator('.ProseMirror').first();
  await editor.click();
  await page.keyboard.type(words);

  // Saved after a pause in typing: the server has it once the request is answered.
  await page.waitForResponse(
    response =>
      response.url().includes('/api/diary/entries') &&
      response.request().method() !== 'GET' &&
      response.ok(),
  );
  await page.reload();
  await expect(page.locator('.ProseMirror').first()).toContainText(words);
});
