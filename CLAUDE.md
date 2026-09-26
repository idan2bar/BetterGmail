# Chat Mail

Chrome extension (Manifest V3) that improves the Gmail UI.

## Hard rules

- **Client-only.** No backend, no server calls of our own. Everything runs in the browser.
- **Use InboxSDK (`@inboxsdk/core`) to interact with the Gmail UI.** Do not locate Gmail elements by arbitrary
  ids/class names/selectors (Gmail's are obfuscated and change). Get anchor elements from SDK APIs
  (e.g. `NavMenu.addNavItem(...).getElement()`, `ThreadRowView.getElement()`, router/route handlers) and derive
  placement structurally from them. Only fall back to raw DOM work for things the SDK has no API for, and keep it
  relative to SDK-provided elements.

## Layout

- `src/content.js` – content script on `mail.google.com`; loads InboxSDK and mounts UI.
- `src/background.js` – service worker; just imports the SDK's `background.js` (injects `pageWorld.js`, needed on MV3).
- `src/static/` – manifest, popup, icon (copied as-is to `dist/`).
- `build.mjs` – esbuild bundling into `dist/` (also copies the SDK's `pageWorld.js` to `dist/` root).
- `dist/` – build output; **this is the folder to load unpacked** in `chrome://extensions`. Gitignored.

## Workflow

```
npm install
npm run build     # or: npm run watch
```

Then load `dist/` as an unpacked extension and reload the Gmail tab. Reload the extension after each rebuild.

InboxSDK needs an app id: replace `APP_ID` in `src/content.js` with one registered at https://www.inboxsdk.com/register.

## Current features

- Vertical side panel inserted between the left main menu and the mail list's white area (outside the inbox tabs),
  stretching to fill the available height.

## Working conventions

- **Commit messages:** concise, clear, one-line description of what changed. No `Co-Authored-By` or other Claude attribution lines.
- **Always build after changes:** after any change that requires `npm run build` to take effect (anything under `src/`, `build.mjs`, or dependencies), run it yourself; don't leave it for the user.
- **Never push:** do not run `git push` (or otherwise publish commits to a remote). Committing locally is fine; pushing is left to the user.
