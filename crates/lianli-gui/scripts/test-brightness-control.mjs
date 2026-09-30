import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/utils/brightnessControl.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { createBrightnessControl } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
const sent = [];
const errors = [];
const releases = [];
const control = createBrightnessControl(
  (device, value) => {
    sent.push([device, value]);
    return new Promise((resolve, reject) => releases.push({ resolve, reject }));
  },
  (device, error) => errors.push([device, error]),
);

for (let value = 0; value <= 100; value++) control.set("head", value);
await delay(250);
assert.deepEqual(sent, [["head", 100]]);
for (let value = 100; value >= 0; value--) control.set("head", value);
control.set("other", 37);
await delay(250);
assert.equal(sent.length, 1, "no overlapping requests while delivery is blocked");
releases.shift().reject("old request expired");
await delay(250);
assert.deepEqual(errors, [], "superseded failures do not obscure the new request");
assert.deepEqual(sent.at(-1), ["head", 0]);
releases.shift().resolve();
await delay(250);
assert.deepEqual(sent.at(-1), ["other", 37]);
releases.shift().reject("LCD not found");
await delay(0);
assert.deepEqual(errors, [["other", "LCD not found"]]);
control.set("other", 80);
await delay(250);
assert.deepEqual(sent.at(-1), ["other", 80], "a later request still runs after an error");
control.set("head", 50);
control.dispose();
releases.shift().reject("shutdown");
await delay(250);
assert.equal(sent.length, 4, "disposal drops pending changes");
assert.equal(errors.length, 1, "disposal suppresses late errors");
console.log("Brightness coalescing, serialization, failures and disposal passed");
