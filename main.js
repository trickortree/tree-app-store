const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, execFile } = require("child_process");
const { autoUpdater } = require("electron-updater");

app.setAppUserModelId("com.trickortree.treeappstore");

if (!app.requestSingleInstanceLock()) {
    app.quit();
}

// The app list. A copy of apps.json on GitHub (main branch) overrides the bundled one,
// so editing apps.json and pushing updates everyone without a new release.
const CATALOG_URL = "https://raw.githubusercontent.com/trickortree/tree-app-store/main/apps.json";
const TYPES = ["github", "download", "link"];

let catalog = require("./apps.json");
let mainWindow = null;
const installing = new Set();

function send(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 760,
        minHeight: 520,
        backgroundColor: "#0f1a14",
        autoHideMenuBar: true,
        title: "Tree App Store",
        icon: path.join(__dirname, "build", "icon.ico"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    mainWindow.loadFile("index.html");
    mainWindow.on("focus", () => send("window:focus"));
}

/* ---------- Catalog ---------- */

function validCatalog(list) {
    return Array.isArray(list) && list.every(a =>
        a && typeof a.id === "string" && typeof a.name === "string" && TYPES.includes(a.type)
        && (a.type === "github" ? typeof a.repo === "string" && typeof a.productName === "string"
            : /^https:\/\//.test(a.url || "")));
}

async function loadRemoteCatalog() {
    const cacheFile = path.join(app.getPath("userData"), "apps-cache.json");
    try {
        const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(5000), cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = await res.json();
        if (!validCatalog(list)) throw new Error("apps.json on GitHub is not valid");
        fs.writeFileSync(cacheFile, JSON.stringify(list));
        catalog = list;
    } catch (err) {
        console.error("Catalog fetch failed, using cached/bundled list:", err.message);
        try {
            const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
            if (validCatalog(cached)) catalog = cached;
        } catch { /* no cache yet */ }
    }
}

/* ---------- Store ---------- */

function installedExe(entry) {
    if (entry.type !== "github") return null;
    const name = entry.productName;
    const candidates = [
        path.join(process.env.LOCALAPPDATA || "", "Programs", name, `${name}.exe`)
    ];
    // Custom install directory: follow the Start Menu shortcut the installer created.
    const lnk = path.join(
        process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", `${name}.lnk`
    );
    try { candidates.push(shell.readShortcutLink(lnk).target); } catch { /* no shortcut */ }
    return candidates.find(p => p && fs.existsSync(p)) || null;
}

function entryFor(id) {
    return catalog.find(a => a.id === id);
}

ipcMain.handle("app:version", () => app.getVersion());

// Version of an installed app, read from its exe (electron-builder stamps the app version into it).
function installedVersion(exe) {
    return new Promise(resolve => {
        const script = `(Get-Item -LiteralPath '${exe.replace(/'/g, "''")}').VersionInfo.FileVersion`;
        execFile("powershell", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 8000 },
            (err, out) => resolve(err ? null : (String(out).trim() || null)));
    });
}

const latestCache = new Map(); // repo -> { version, at }
async function latestVersion(entry) {
    const hit = latestCache.get(entry.repo);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.version;
    try {
        const res = await fetch(`https://api.github.com/repos/${entry.repo}/releases/latest`, {
            headers: { "User-Agent": "tree-app-store", Accept: "application/vnd.github+json" },
            signal: AbortSignal.timeout(6000)
        });
        if (!res.ok) throw new Error(String(res.status));
        const version = (await res.json()).tag_name.replace(/^v/, "");
        latestCache.set(entry.repo, { version, at: Date.now() });
        return version;
    } catch {
        return null;
    }
}

function newer(latest, installed) {
    const a = String(latest).split(".").map(Number), b = String(installed).split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    }
    return false;
}

ipcMain.handle("apps:list", () => Promise.all(catalog.map(async a => {
    const exe = installedExe(a);
    const installed = !!exe;
    let current = null, latest = null;
    if (installed) [current, latest] = await Promise.all([installedVersion(exe), latestVersion(a)]);
    return {
        id: a.id,
        name: a.name,
        description: a.description || "",
        icon: a.icon || "📦",
        kind: a.type,
        installed,
        version: current,
        update: !!(current && latest && newer(latest, current)) ? latest : null
    };
})));

ipcMain.handle("apps:uninstall", (_e, id) => {
    const entry = entryFor(id);
    const exe = entry && installedExe(entry);
    if (!exe) return { ok: false, error: "Not installed." };
    const uninstaller = path.join(path.dirname(exe), `Uninstall ${entry.productName}.exe`);
    if (!fs.existsSync(uninstaller)) return { ok: false, error: "Couldn't find its uninstaller. Use Windows Settings > Apps instead." };
    spawn(uninstaller, [], { detached: true, stdio: "ignore", cwd: path.dirname(uninstaller) }).unref();
    return { ok: true };
});

async function downloadFile(url, fileName, id) {
    const dl = await fetch(url, { headers: { "User-Agent": "tree-app-store" } });
    if (!dl.ok) throw new Error(`Download failed (${dl.status}).`);
    const dir = path.join(os.tmpdir(), "tree-app-store");
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, path.basename(fileName));
    const total = Number(dl.headers.get("content-length")) || 0;
    const out = fs.createWriteStream(dest);
    let done = 0;
    for await (const chunk of dl.body) {
        if (!out.write(chunk)) await new Promise(r => out.once("drain", r));
        done += chunk.length;
        send("apps:progress", { id, percent: total ? Math.round(done / total * 100) : 0 });
    }
    await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())));
    return dest;
}

async function latestInstaller(entry) {
    const res = await fetch(`https://api.github.com/repos/${entry.repo}/releases/latest`, {
        headers: { "User-Agent": "tree-app-store", Accept: "application/vnd.github+json" }
    });
    if (!res.ok) throw new Error(`Could not find the latest release (${res.status}).`);
    const release = await res.json();
    const asset = release.assets.find(a => /setup.*\.exe$/i.test(a.name))
        || release.assets.find(a => /\.exe$/i.test(a.name));
    if (!asset) throw new Error("The latest release has no Windows installer.");
    return { url: asset.browser_download_url, name: asset.name };
}

ipcMain.handle("apps:install", async (_e, id) => {
    const entry = entryFor(id);
    if (!entry) return { ok: false, error: "Unknown app." };
    if (entry.type === "link") {
        await shell.openExternal(entry.url);
        return { ok: true };
    }
    if (installing.has(id)) return { ok: false, error: "Already installing." };
    installing.add(id);
    try {
        let source;
        if (entry.type === "github") source = await latestInstaller(entry);
        else source = { url: entry.url, name: entry.filename || path.basename(new URL(entry.url).pathname) };
        const file = await downloadFile(source.url, source.name, id);
        const err = await shell.openPath(file);
        return err ? { ok: false, error: err } : { ok: true };
    } catch (err) {
        return { ok: false, error: String(err.message || err) };
    } finally {
        installing.delete(id);
    }
});

ipcMain.handle("apps:open", (_e, id) => {
    const entry = entryFor(id);
    const exe = entry && installedExe(entry);
    if (!exe) return { ok: false, error: "Not installed." };
    spawn(exe, [], { detached: true, stdio: "ignore", cwd: path.dirname(exe) }).unref();
    return { ok: true };
});

/* ---------- Updates ---------- */

function setupAutoUpdater() {
    if (!app.isPackaged) {
        ipcMain.on("update:check", () => send("update:status", { state: "none" }));
        return;
    }
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("checking-for-update", () => send("update:status", { state: "checking" }));
    autoUpdater.on("update-not-available", () => send("update:status", { state: "none" }));
    autoUpdater.on("update-available", info => send("update:status", { state: "downloading", version: info.version, percent: 0 }));
    autoUpdater.on("download-progress", p => send("update:status", { state: "downloading", percent: Math.round(p.percent) }));
    autoUpdater.on("update-downloaded", info => send("update:ready", { version: info.version }));
    autoUpdater.on("error", err => {
        console.error("AUTO-UPDATER ERROR:", err);
        send("update:status", { state: "error", message: String(err.message || err).slice(0, 120) });
    });
    ipcMain.on("update:restart", () => autoUpdater.quitAndInstall());
    ipcMain.on("update:check", () => autoUpdater.checkForUpdates().catch(() => {}));
    autoUpdater.checkForUpdates().catch(err => console.error(err));
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

/* ---------- Lifecycle ---------- */

app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
});

app.whenReady().then(async () => {
    await loadRemoteCatalog();
    createWindow();
    setupAutoUpdater();
});

app.on("window-all-closed", () => app.quit());
