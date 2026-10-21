import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { newAccount, signIn } from './account';

test('workstates and chronicles persist and remain isolated between accounts', async ({ page, request }) => {
  const owner = await newAccount(request);
  const other = await newAccount(request);
  const headers = { Authorization: `Bearer ${owner.token}` };
  const otherHeaders = { Authorization: `Bearer ${other.token}` };
  const id = randomUUID();
  const day = new Date().toISOString().slice(0, 10);
  const note = 'A deliberately saved context';

  const capture = await request.post('/api/activity/workstates', {
    headers,
    data: { id, capturedAt: new Date().toISOString(), capture: { activeApp: 'WebStorm', browserUrls: ['https://www.typescriptlang.org/docs/'], note } },
  });
  expect(capture.ok()).toBeTruthy();
  const forbidden = await request.get(`/api/activity/workstates/${id}`, { headers: otherHeaders });
  expect(forbidden.status()).toBe(404);
  const restore = await request.post(`/api/activity/workstates/${id}/restore`, { headers, data: {} });
  expect(restore.ok()).toBeTruthy();
  expect(await restore.json()).toMatchObject({ requiresConfirmation: true, workstateId: id });

  const settings = await request.get('/api/life/narratives/settings', { headers });
  expect(await settings.json()).toEqual({ enabled: false });
  const savedNote = await request.put(`/api/life/narratives/${day}/note`, { headers, data: { note: 'My own daily note.' } });
  expect(savedNote.ok()).toBeTruthy();
  const hidden = await request.get(`/api/life/narratives/${day}`, { headers: otherHeaders });
  expect(await hidden.json()).toBeNull();

  await signIn(page, owner);
  await page.goto('/activity/workstates');
  await expect(page.getByText(note, { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(note, { exact: true }).first()).toBeVisible();
  await page.goto('/life/chronicle');
  await expect(page.locator('textarea').filter({ visible: true }).first()).toHaveValue('My own daily note.');
});