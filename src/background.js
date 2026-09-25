// Required by InboxSDK on MV3: injects the SDK's page-world script into Gmail tabs.
import '@inboxsdk/core/background.js';

// --- Gmail API access (metadata scope) --------------------------------------
// The content script can't use chrome.identity, so it asks us for inbox pages.

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const HEADERS = ['From', 'To', 'Cc', 'Subject', 'Date'];

const getToken = (interactive) => chrome.identity.getAuthToken({ interactive }).then((r) => r.token);

async function gmailGet(path, params) {
  const url = `${API}/${path}?${params}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(true);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 && attempt === 0) {
      await chrome.identity.removeCachedAuthToken({ token }); // stale token: refresh once
      continue;
    }
    if (!res.ok) throw new Error(`Gmail API ${res.status}`);
    return res.json();
  }
}

/** One page of inbox messages (newest first) with just the headers we display. */
async function listInboxPage(pageToken) {
  const list = new URLSearchParams({ labelIds: 'INBOX', maxResults: '25' });
  if (pageToken) list.set('pageToken', pageToken);
  const { messages = [], nextPageToken = null } = await gmailGet('messages', list);

  const details = await Promise.all(
    messages.map((m) => {
      const p = new URLSearchParams({ format: 'metadata' });
      for (const h of HEADERS) p.append('metadataHeaders', h);
      return gmailGet(`messages/${m.id}`, p);
    }),
  );
  const header = (msg, name) =>
    msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
  return {
    nextPageToken,
    messages: details.map((msg) => ({
      subject: header(msg, 'Subject'),
      from: header(msg, 'From'),
      to: header(msg, 'To'),
      cc: header(msg, 'Cc'),
    })),
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'bettergmail:listInbox') return;
  listInboxPage(msg.pageToken).then(
    (data) => sendResponse({ ok: true, data }),
    (err) => sendResponse({ ok: false, error: String(err.message || err) }),
  );
  return true; // async response
});
