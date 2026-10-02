# Editing & pushing guide

Everything below works the same in `tree-app-store` and `tree-lens`.

## 1. Change which apps are in the store, their names, and where they download from

Open [apps.json](apps.json). Each app is one `{ ... }` block. Change the text between the quotes, save, done.

```json
{
  "id": "roblox",
  "name": "Roblox",
  "description": "Play millions of games.",
  "icon": "🎮",
  "type": "link",
  "url": "https://www.roblox.com/download"
}
```

| Field | What it does |
|---|---|
| `id` | Internal name. Unique, lowercase, no spaces. Don't change it once people have the app. |
| `name` | Title shown on the card. |
| `description` | The grey text under the title. |
| `icon` | Any emoji. |
| `type` | How the button works (see below). |

**The three `type`s:**

- `"link"`: the button opens `url` in the browser. Use this for official download pages. To change where Roblox or the VPN comes from, just change its `url`.
- `"download"`: the button downloads `url` (must be `https://`) and runs it. `.exe` and `.msix` both work. Use it only for files you have the right to share, such as your own apps. Optional `"filename": "Setup.exe"`.
- `"github"`: installs the newest installer from a GitHub release. Needs `"repo": "owner/name"` and `"productName"` (the name from that app's `package.json` build section, so the store can find it and show Open).

To remove an app, delete its whole block (and watch the commas: every block except the last needs one after the `}`). To add one, copy a block and edit it.

**The store reads `apps.json` from GitHub** (main branch) every time it starts, so after you push a change to `apps.json`, everybody sees it the next time they open the store. No new release needed. If GitHub can't be reached it uses the last copy it saw.

## 2. Edit the look (HTML/CSS)

- [index.html](index.html): page structure and all the CSS (the `<style>` block at the top). Colors are the `--bg`, `--panel`, `--accent`... lines under `:root`. The title is the `<h1>` line.
- [renderer.js](renderer.js): the code that builds each app card. Button labels ("Install", "Open", "Get") are in `card()`.
- Window size and title: top of `createWindow()` in [main.js](main.js).

In Tree Lens: [bar.html](../tree-lens/bar.html) is the search bar (colors under `:root`, placeholder text on the `<input>`), `bar.js` is its behaviour, and the hotkey list is `HOTKEYS` at the top of `main.js`.

To see changes without releasing:

```
npm start
```

Close the window and run it again after each edit.

## 3. Push it so everyone gets it

**Only edited `apps.json`?** Just push it:

```
git add -A
git commit -m "Update apps"
git push origin main
```

**Changed anything else (HTML, JS, colors)?** Users need a new app version. One command does the whole thing, bump version, commit, push, tag:

```
npm run release
```

That bumps `0.1.0` to `0.1.1`. Use `npm run release -- minor` for `0.2.0` or `npm run release -- 1.0.0` for an exact number. GitHub then builds the installer (watch it on the repo's **Actions** tab, takes ~5 minutes), and installed copies update on their own.

The first push to a brand-new repo needs the repo to exist on github.com first (see tree-lens README).
