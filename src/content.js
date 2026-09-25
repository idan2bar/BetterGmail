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

function createPanel() {
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  Object.assign(panel.style, {
    alignSelf: 'stretch', // fill the available height of the flex row
    flex: '0 0 220px',
    width: '220px',
    boxSizing: 'border-box',
    margin: '0 8px 0 0',
    padding: '12px',
    borderRadius: '16px',
    background: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(0,0,0,0.08)',
    overflow: 'auto',
    font: '14px/1.4 "Google Sans", Roboto, Arial, sans-serif',
  });
  panel.textContent = 'Better Gmail';
  return panel;
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
  }
}

main().catch((err) => console.error('[BetterGmail]', err));
