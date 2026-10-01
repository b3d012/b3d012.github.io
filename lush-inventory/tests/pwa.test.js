import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("manifest is scoped to inventory and launches standalone", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.src === "./icon.svg"));
});

test("upgrade precaches every runtime module and serves it offline within inventory scope", async () => {
  const scope = "https://example.test/lush-inventory/";
  const records = new Map(), listeners = {}, removed = [];
  const key = (request) => new URL(typeof request === "string" ? request : request.url, scope).href;
  const cache = {
    addAll: async (paths) => { for (const path of paths) records.set(key(path), new Response(`cached ${path}`)); },
    put: async (request, response) => records.set(key(request), response),
    match: async (request) => records.get(key(request))?.clone()
  };
  let claimed = false;
  vm.runInNewContext(await readFile(new URL("../sw.js", import.meta.url), "utf8"), {
    URL, Promise, fetch: async () => { throw new Error("offline"); },
    self: { location: { origin: "https://example.test" }, registration: { scope }, skipWaiting() {}, clients: { claim: async () => { claimed = true; } }, addEventListener: (name, fn) => listeners[name] = fn },
    caches: { open: async () => cache, match: cache.match, keys: async () => ["lush-inventory-v1", "cleaning-app-v1"], delete: async (name) => { removed.push(name); return true; } }
  });
  let pending;
  listeners.install({ waitUntil: (promise) => pending = promise }); await pending;
  for (const module of ["app", "app-logic", "count-model", "count-store", "xlsx-adapter", "coordinator-ui", "coordinator-store", "history-model", "expiry-model", "full-backup", "pin-config"]) {
    let response;
    listeners.fetch({ request: { url: `${scope}src/${module}.js`, method: "GET", mode: "cors" }, respondWith: (promise) => response = promise });
    assert.equal((await response).status, 200, `${module} must open offline`);
  }
  for (const asset of ["index.html", "styles.css", "vendor/xlsx.full.min.js", "manifest.webmanifest", "icon.svg"]) assert.ok(await cache.match(asset), `${asset} must be cached`);
  let handled = false;
  listeners.fetch({ request: { url: "https://example.test/cleaning/", method: "GET", mode: "navigate" }, respondWith: () => handled = true });
  assert.equal(handled, false, "inventory worker cannot capture another shop app");
  listeners.activate({ waitUntil: (promise) => pending = promise }); await pending;
  assert.equal(claimed, true);
  assert.deepEqual(removed, ["lush-inventory-v1"]);
});
