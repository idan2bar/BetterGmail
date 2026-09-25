import * as InboxSDK from '@inboxsdk/core';

// Register your own app id at https://www.inboxsdk.com/register
const APP_ID = 'sdk_Better-Gmail_9f9db1f03f';
const PANEL_ID = 'better-gmail-side-panel';

/**
 * Finds the nearest common ancestor of two elements.
 */
function commonAncestor(a, b) {
  for (let node = a; node; node = node.parentElement) {
    if (node.contains(b)) return node;
  }
  return null;
}

/**
 * Returns the child of `parent` that contains `el`.
 */
function childContaining(parent, el) {
  let node = el;
  while (node && node.parentElement !== parent) node = node.parentElement;
  return node;
}

const WIDTH_KEY = 'bettergmail:panelWidth';
const MIN_WIDTH = 160;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 220;

const clampWidth = (w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)));

function loadWidth() {
  try {
    const w = parseInt(localStorage.getItem(WIDTH_KEY), 10);
    if (Number.isFinite(w)) return clampWidth(w);
  } catch {}
  return DEFAULT_WIDTH;
}

function saveWidth(w) {
  try {
    localStorage.setItem(WIDTH_KEY, String(w));
  } catch {}
}

function setWidth(panel, w) {
  panel.style.flexBasis = `${w}px`;
  panel.style.width = `${w}px`;
}

/**
 * The right-edge drag handle. Pointer capture keeps the drag alive outside the
 * handle, and user-select is disabled on the page while dragging.
 */
function createResizeHandle(panel) {
  const handle = document.createElement('div');
  Object.assign(handle.style, {
    position: 'absolute',
    top: '0',
    right: '0',
    bottom: '0',
    width: '6px',
    cursor: 'col-resize',
    touchAction: 'none',
    userSelect: 'none',
    zIndex: '1',
  });
  let startX = 0;
  let startWidth = 0;
  let prevUserSelect = '';
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    handle.style.background = 'rgba(26,115,232,0.35)';
  });
  handle.addEventListener('pointermove', (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    setWidth(panel, clampWidth(startWidth + e.clientX - startX));
  });
  const end = (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    handle.releasePointerCapture(e.pointerId);
    document.body.style.userSelect = prevUserSelect;
    handle.style.background = '';
    saveWidth(clampWidth(panel.getBoundingClientRect().width));
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  return handle;
}

/**
 * The panel is a non-scrolling flex-column wrapper holding a scrollable list
 * (`panel.list`, which renderContacts fills) and the resize handle.
 */
function createPanel() {
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  const width = loadWidth();
  Object.assign(panel.style, {
    alignSelf: 'stretch', // fill the available height of the flex row
    flex: `0 0 ${width}px`,
    width: `${width}px`,
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '0',
    contain: 'size', // its content never contributes to the row's height
    boxSizing: 'border-box',
    margin: '0 8px 0 0',
    borderRadius: '16px',
    background: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(0,0,0,0.08)',
    overflow: 'hidden',
    font: '14px/1.4 "Google Sans", Roboto, Arial, sans-serif',
  });

  const list = document.createElement('div');
  Object.assign(list.style, {
    flex: '1 1 auto',
    minHeight: '0',
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '12px',
  });
  panel.list = list;
  panel.append(list, createResizeHandle(panel));
  return panel;
}

// --- Contact list -----------------------------------------------------------

const GRAY = '#5f6368';
const USER_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff" aria-hidden="true">' +
  '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z"/></svg>';

let selectedAddress = null;

function createCard({ address, name, subject }) {
  const card = document.createElement('div');
  card.dataset.address = address;
  card.setAttribute('role', 'option');
  card.tabIndex = 0;
  const selected = address === selectedAddress;
  card.setAttribute('aria-selected', String(selected));
  Object.assign(card.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px',
    borderRadius: '12px',
    cursor: 'pointer',
    background: selected ? 'rgba(26,115,232,0.16)' : 'transparent',
  });

  const avatar = document.createElement('div');
  Object.assign(avatar.style, {
    flex: '0 0 36px',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: '#9aa0a6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });
  avatar.innerHTML = USER_ICON;

  const text = document.createElement('div');
  Object.assign(text.style, { minWidth: 0, flex: '1 1 auto' });
  const nameEl = document.createElement('div');
  nameEl.textContent = name || address;
  nameEl.title = address;
  const subjectEl = document.createElement('div');
  subjectEl.textContent = subject;
  Object.assign(subjectEl.style, { color: GRAY, fontSize: '12px' });
  for (const el of [nameEl, subjectEl]) {
    Object.assign(el.style, { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
  }
  nameEl.style.fontWeight = '500';
  text.append(nameEl, subjectEl);

  card.append(avatar, text);
  return card;
}

/**
 * Renders one card per address, in the order given (most recent mail first).
 * Cards are selectable; selection is kept in `selectedAddress` and announced
 * with a `bettergmail:contactselect` event on the panel for later filtering.
 */
function renderContacts(panel, contacts) {
  panel.list.replaceChildren(...contacts.map(createCard));
  panel.list.setAttribute('role', 'listbox');
}

function setupSelection(panel, rerender) {
  const toggle = (card) => {
    const address = card.dataset.address;
    selectedAddress = selectedAddress === address ? null : address;
    rerender();
    panel.dispatchEvent(new CustomEvent('bettergmail:contactselect', { detail: { address: selectedAddress } }));
  };
  panel.addEventListener('click', (e) => {
    const card = e.target.closest('[data-address]');
    if (card) toggle(card);
  });
  panel.addEventListener('keydown', (e) => {
    const card = e.target.closest?.('[data-address]');
    if (card && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggle(card);
    }
  });
}

/**
 * When the menu is collapsed Gmail lays it out over the content area instead of
 * beside it, so the panel would sit underneath the menu icons. Measure where the
 * menu column ends and push the panel right by however much they overlap.
 */
function keepClearOfMenu(panel, menuColumn) {
  const update = () => {
    panel.style.marginLeft = '0px';
    const overlap = menuColumn.getBoundingClientRect().right - panel.getBoundingClientRect().left;
    panel.style.marginLeft = `${Math.max(0, Math.ceil(overlap))}px`;
  };
  const observer = new ResizeObserver(update);
  observer.observe(menuColumn);
  observer.observe(document.body);
  menuColumn.addEventListener('transitionend', update);
  update();
}

async function main() {
  const sdk = await InboxSDK.load(2, APP_ID);

  // Both elements below are handed to us by the SDK, so the panel position is
  // derived from them instead of from Gmail's internal class names or ids.
  let navEl = null;
  let listEl = null;

  // A nav item gives us a stable element inside the main (left) menu.
  sdk.NavMenu.addNavItem({ name: 'Better Gmail' }).getElement().then((el) => {
    navEl = el;
    mount();
  });

  // A thread row gives us an element inside the mail list.
  sdk.Lists.registerThreadRowViewHandler((row) => {
    listEl = row.getElement();
    mount();
  });

  const myAddress = sdk.User.getEmailAddress().toLowerCase();

  // Thread rows currently rendered by Gmail -> what we read from them.
  const rows = new Map();
  let refreshQueued = false;

  function refresh() {
    refreshQueued = false;
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    // Gmail lists newest mail first, so document order is recency order.
    const ordered = [...rows.entries()].sort(([a], [b]) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    const contacts = new Map();
    for (const [, { contacts: list, subject }] of ordered) {
      for (const { emailAddress, name } of list) {
        const address = emailAddress.toLowerCase();
        if (address === myAddress || contacts.has(address)) continue;
        contacts.set(address, { address, name, subject });
      }
    }
    renderContacts(panel, [...contacts.values()]);
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(refresh);
  }

  // Each row exposes its senders/recipients and subject through the SDK.
  sdk.Lists.registerThreadRowViewHandler((row) => {
    const el = row.getElement();
    const read = () => {
      rows.set(el, { contacts: row.getContacts(), subject: row.getSubject() });
      queueRefresh();
    };
    read();
    row.on('destroy', () => {
      rows.delete(el);
      queueRefresh();
    });
  });

  function mount() {
    if (!navEl || !listEl || !navEl.isConnected || !listEl.isConnected) return;
    if (document.getElementById(PANEL_ID)) return;

    // The row that lays out [menu][main area]: the lowest ancestor holding both.
    const container = commonAncestor(navEl, listEl);
    // The main white area (inbox tabs + list) is the child holding the list.
    const mainArea = container && childContaining(container, listEl);
    if (!mainArea) return;

    const panel = createPanel();
    container.insertBefore(panel, mainArea);
    keepClearOfMenu(panel, childContaining(container, navEl));
    setupSelection(panel, refresh);
    refresh();
  }
}

main().catch((err) => console.error('[BetterGmail]', err));
