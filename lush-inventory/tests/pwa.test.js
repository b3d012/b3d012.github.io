import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("manifest is scoped to the inventory subfolder and launches standalone", async () => {
  const manifest = JSON.parse(await fs.readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.src === "./icon.svg"));
});

test("service worker precaches every runtime dependency for offline counting", async () => {
  const source = await fs.readFile(new URL("../sw.js", import.meta.url), "utf8");
  for (const asset of ["./index.html", "./styles.css", "./src/app.js", "./src/app-logic.js", "./src/count-model.js", "./src/count-store.js", "./src/xlsx-adapter.js", "./vendor/xlsx.full.min.js", "./manifest.webmanifest", "./icon.svg"]) {
    assert.match(source, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /cdn\.|unpkg|jsdelivr/i);
});
