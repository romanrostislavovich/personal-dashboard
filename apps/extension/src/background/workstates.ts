import {workstatesApi} from '@pd/client-core';
import {workstateIdSchema, workstateInputSchema} from '@pd/contracts';
import {
  ExtensionError,
  type WorkstatePreview,
  type WorkstateRequest,
} from '../shared/messages';
import {allowedTelemetryUrl} from '../shared/telemetry-gates';
import {serverUrl, signedInClient} from './account';
import {exclusions} from './telemetry';
import {telemetryExclusive} from './telemetry-state';
import {clearWorkstatePreview, workstateState} from './workstate-state';

const PREVIEW_MS = 120_000;

export function fromWorkstatePanel(
  message: WorkstateRequest,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  const document = panelDocument(sender);
  if (message.type === 'workstate-cancel') {
    clearWorkstatePreview();
    return Promise.resolve();
  }
  const revision = workstateState.revision;
  // Share the authentication lock: even an API refresh/retry cannot switch accounts mid-send.
  return telemetryExclusive(async () => {
    if (revision !== workstateState.revision)
      throw new ExtensionError('not-allowed');
    if (message.type === 'workstate-preview')
      return preview(message.windowId, document);
    if (message.type === 'workstate-confirm')
      return confirm(message.id, document);
    if (message.type === 'workstate-open') {
      const {server} = await identity();
      await chrome.tabs.create({url: `${server}/activity/workstates`});
      return;
    }
    throw new ExtensionError('not-allowed');
  });
}

function panelDocument(sender: chrome.runtime.MessageSender): string {
  if (
    sender.id !== chrome.runtime.id ||
    sender.url !== chrome.runtime.getURL('sidepanel.html') ||
    sender.origin !== chrome.runtime.getURL('').replace(/\/$/, '') ||
    sender.tab !== undefined ||
    !sender.documentId ||
    sender.documentLifecycle !== 'active' ||
    chrome.extension.inIncognitoContext
  ) {
    throw new ExtensionError('not-allowed');
  }
  return sender.documentId;
}

async function identity() {
  const client = await signedInClient();
  const user = await client.offlineUser();
  const server = await serverUrl();
  if (!user?.id || !server) throw new ExtensionError('signed-out');
  return {client, server, owner: JSON.stringify([server, user.id])};
}

async function foreground(windowId: number) {
  if (!Number.isInteger(windowId) || windowId < 0)
    throw new ExtensionError('not-allowed');
  const window = await chrome.windows.get(windowId);
  const [tab] = await chrome.tabs.query({windowId, active: true});
  if (
    !window.focused ||
    window.incognito ||
    window.type !== 'normal' ||
    !tab?.active ||
    tab.id === undefined ||
    tab.incognito ||
    tab.discarded ||
    tab.status !== 'complete' ||
    tab.pendingUrl ||
    !tab.url ||
    (await chrome.idle.queryState(60)) !== 'active'
  ) {
    throw new ExtensionError('not-allowed');
  }
  const rules = await exclusions();
  const url = allowedTelemetryUrl(tab.url, rules.excluded, rules.privateWords);
  if (!url) throw new ExtensionError('not-allowed');
  return {tab: tab.id, url};
}

async function preview(
  windowId: number,
  document: string,
): Promise<WorkstatePreview> {
  clearWorkstatePreview();
  const revision = workstateState.revision;
  const account = await identity();
  const page = await foreground(windowId);
  const input = workstateInputSchema.parse({
    id: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
    capture: {browserUrls: [page.url]},
  });
  if (revision !== workstateState.revision)
    throw new ExtensionError('not-allowed');
  const expires = Date.now() + PREVIEW_MS;
  workstateState.draft = {
    input,
    owner: account.owner,
    document,
    window: windowId,
    tab: page.tab,
    expires,
  };
  setTimeout(() => {
    if (workstateState.draft?.input.id === input.id) clearWorkstatePreview();
  }, PREVIEW_MS);
  return {input, server: account.server, expires};
}

async function confirm(id: string, document: string): Promise<void> {
  const draft = workstateState.draft;
  if (
    !draft ||
    draft.document !== document ||
    !workstateIdSchema.safeParse(id).success
  ) {
    throw new ExtensionError('not-allowed');
  }
  clearWorkstatePreview();
  const revision = workstateState.revision;
  if (draft.input.id !== id || draft.expires <= Date.now()) {
    throw new ExtensionError('not-allowed');
  }
  const page = await foreground(draft.window);
  const account = await identity();
  if (
    account.owner !== draft.owner ||
    page.tab !== draft.tab ||
    page.url !== draft.input.capture.browserUrls[0] ||
    revision !== workstateState.revision ||
    draft.expires <= Date.now()
  ) {
    throw new ExtensionError('not-allowed');
  }
  await workstatesApi(account.client.api).capture(
    workstateInputSchema.parse(draft.input),
  );
}
