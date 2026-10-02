const $ = id => document.getElementById(id);

const progress = {};
const errors = {};

async function renderApps() {
    const apps = await window.store.getApps();
    $("grid").replaceChildren(...apps.map(card));
}

function el(tag, props = {}, ...kids) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...kids);
    return node;
}

function card(app) {
    const busy = app.id in progress;
    let label = app.kind === "link" ? "Get" : "Install";
    if (app.installed) label = app.update ? `Update to v${app.update}` : "Open";
    if (busy) label = progress[app.id] > 0 ? `Downloading ${progress[app.id]}%` : "Starting...";

    const btn = el("button", { textContent: label, disabled: busy });
    btn.classList.toggle("primary", !app.installed || !!app.update);
    btn.onclick = async () => {
        delete errors[app.id];
        if (app.installed && !app.update) {
            const r = await window.store.open(app.id);
            if (!r.ok) errors[app.id] = r.error;
        } else {
            if (app.kind !== "link") progress[app.id] = 0;
            renderApps();
            const r = await window.store.install(app.id);
            delete progress[app.id];
            if (!r.ok) errors[app.id] = r.error;
        }
        renderApps();
    };

    const note = app.kind === "link" ? "Opens the download page"
        : app.installed ? (app.version ? `Installed v${app.version}` : "Installed") : "";
    const uninstall = app.installed && !busy
        ? el("button", {
            className: "ghost", textContent: "Uninstall",
            onclick: async () => {
                if (!confirm(`Uninstall ${app.name}?`)) return;
                const r = await window.store.uninstall(app.id);
                if (!r.ok) errors[app.id] = r.error;
                renderApps();
            }
        })
        : "";
    return el("div", { className: "card" },
        el("div", { className: "top" },
            el("div", { className: "icon", textContent: app.icon }),
            el("h2", { textContent: app.name })),
        el("p", { textContent: app.description }),
        el("div", { className: "row" }, btn, uninstall, el("span", { className: "note", textContent: note })),
        errors[app.id] ? el("div", { className: "err", textContent: errors[app.id] }) : ""
    );
}

window.store.onInstallProgress(({ id, percent }) => { progress[id] = percent; renderApps(); });
// The installer runs outside the store, so refresh when the user comes back.
window.store.onFocus(renderApps);
window.store.version().then(v => { $("version").textContent = `v${v}`; });
window.store.onUpdateReady(({ version }) => {
    $("banner-text").textContent = `Version ${version} is ready.`;
    $("banner").style.display = "flex";
});
$("banner-btn").onclick = () => window.store.restartForUpdate();
renderApps();

$("check").onclick = () => window.store.checkForUpdates();
window.store.onUpdateStatus(s => {
    const text = {
        checking: "Checking for updates...",
        none: "Tree App Store is up to date.",
        downloading: `Downloading update${s.percent != null ? ` ${s.percent}%` : ""}...`,
        error: `Couldn't check: ${s.message || "network error"}`
    }[s.state] || "";
    $("upd-status").textContent = text;
    if (s.state === "none") setTimeout(() => { $("upd-status").textContent = ""; }, 4000);
});
