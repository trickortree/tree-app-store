// Usage: npm run release            (bumps the patch version, e.g. 0.1.0 -> 0.1.1)
//        npm run release -- minor   (0.1.1 -> 0.2.0)
//        npm run release -- 1.0.0   (exact version)
// Commits everything you changed, pushes main, tags vX.Y.Z and pushes the tag.
// The tag makes GitHub Actions build and publish the release.
const { execFileSync } = require("child_process");
const fs = require("fs");

const run = (...args) => execFileSync("git", args, { stdio: "inherit" });

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const arg = process.argv[2] || "patch";
let [major, minor, patch] = pkg.version.split(".").map(Number);

let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else if (arg === "major") next = `${major + 1}.0.0`;
else if (arg === "minor") next = `${major}.${minor + 1}.0`;
else if (arg === "patch") next = `${major}.${minor}.${patch + 1}`;
else {
    console.error("Use: patch, minor, major, or an exact version like 1.2.3");
    process.exit(1);
}

pkg.version = next;
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
// package-lock.json carries the version too; keep it in sync if it exists.
if (fs.existsSync("package-lock.json")) {
    const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
    lock.version = next;
    if (lock.packages && lock.packages[""]) lock.packages[""].version = next;
    fs.writeFileSync("package-lock.json", JSON.stringify(lock, null, 2) + "\n");
}

run("add", "-A");
run("commit", "-m", `Release v${next}`);
run("push", "origin", "main");
run("tag", `v${next}`);
run("push", "origin", `v${next}`);
console.log(`\nPushed v${next}. Watch the build on the repo's Actions tab.`);
