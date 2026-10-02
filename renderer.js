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
    if (app.installed) label = "Open";
    if (busy) label = progress[app.id] > 0 ? `Downloading ${progress[app.id]}%` : "Starting...";

    const btn = el("button", { textContent: label, disabled: busy });
    btn.classList.toggle("primary", !app.installed);
    btn.onclick = async () => {
        delete errors[app.id];
        if (app.installed) {
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

    const note = app.kind === "link" ? "Opens the download page" : app.installed ? "Installed" : "";
    return el("div", { className: "card" },
        el("div", { className: "top" },
            el("div", { className: "icon", textContent: app.icon }),
            el("h2", { textContent: app.name })),
        el("p", { textContent: app.description }),
        el("div", { className: "row" }, btn, el("span", { className: "note", textContent: note })),
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
