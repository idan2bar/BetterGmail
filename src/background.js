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
    if (!res.ok) {
      // Google's error body says why (API disabled, missing scope, not a test user, ...).
      const detail = await res.json().then((j) => j.error?.message, () => '');
      throw new Error(`Gmail API ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    // A `fields`-filtered response with nothing left in it (e.g. a search with no hits)
    // can come back with an empty body, which res.json() would reject.
    const text = await res.text();
    return text ? JSON.parse(text) : {};
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

const UNREAD_CAP = 100; // list at most this many ids; the UI shows 99+ beyond 99

/**
 * Exact unread inbox count for one address, capped at UNREAD_CAP. A single ids-only
 * list request: a full page of ids means "cap or more".
 */
async function countUnread(address) {
  const q = `in:inbox is:unread (from:${address} OR to:${address} OR cc:${address})`;
  const params = new URLSearchParams({ q, maxResults: String(UNREAD_CAP), fields: 'messages/id' });
  const { messages = [] } = await gmailGet('messages', params);
  return messages.length;
}

/** Counts for several addresses -> { address: count }. */
async function countUnreadMany(addresses) {
  const counts = await Promise.all(addresses.map(countUnread));
  return Object.fromEntries(addresses.map((a, i) => [a, counts[i]]));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  let work;
  if (msg?.type === 'chatmail:listInbox') work = listInboxPage(msg.pageToken);
  else if (msg?.type === 'chatmail:countUnread') work = countUnreadMany(msg.addresses);
  else return;
  work.then(
    (data) => sendResponse({ ok: true, data }),
    (err) => sendResponse({ ok: false, error: String(err.message || err) }),
  );
  return true; // async response
});
