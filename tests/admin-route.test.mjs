/**
 * Targeted regression tests for the built HSN site bundle.
 *
 * The React source is not in the repo — the app ships as a prebuilt bundle in
 * assets/index-cxaajgak.js — so these tests execute the bundle inside jsdom
 * (via Node's vm, which jsdom requires) and verify key routing behaviors:
 *
 *   - /manage-portal-9f3a  -> opens the Admin Portal login (the "admin panel")
 *   - /#manage-portal-9f3a -> the Admin hash link opens the Admin Portal login
 *   - /                 -> renders the entry gateway for fresh visitors
 *   - /products         -> gateway first, products view after entering store
 *   - login flow        -> correct email + password opens "HSN Command Center"
 *
 * Run with: node --test   (or: bun run test)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
let bundle = readFileSync(path.join(root, "assets/index-cxaajgak.js"), "utf8");
// Strip the trailing ESM `export{...};` so the bundle runs as a classic script
// (the app self-mounts onto #root; the exports are unused).
bundle = bundle.replace(/export\s*\{[^}]*\};\s*$/, "");
// Vite's modulepreload helper uses `import.meta`, which is only valid inside
// modules. In the real browser the bundle is a module, so this is purely a
// test-harness shim: `import.meta.resolve` is undefined and `.url` becomes
// the current page URL, exactly what the helper needs.
bundle = bundle.replaceAll("import.meta", "({url:location.href})");

const doms = [];

function loadApp(pathname) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, {
    url: `http://localhost${pathname}`,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  doms.push(dom);
  const { window } = dom;

  // Polyfills for browser APIs jsdom does not implement.
  window.matchMedia =
    window.matchMedia ||
    ((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }));
  window.IntersectionObserver =
    window.IntersectionObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  window.fetch = async () => {
    throw new Error("fetch should not be called during route render tests");
  };

  const script = window.document.createElement("script");
  script.textContent = bundle;
  window.document.body.appendChild(script);
  return dom;
}

const settle = (dom, ms = 350) =>
  new Promise((resolve) => dom.window.setTimeout(resolve, ms));

const rootText = (dom) =>
  dom.window.document.getElementById("root")?.textContent ?? "";

test.after(() => {
  for (const dom of doms) dom.window.close();
});

test("/manage-portal-9f3a opens the admin portal login", async () => {
  const dom = loadApp("/manage-portal-9f3a");
  await settle(dom);
  const text = rootText(dom);
  assert.match(text, /Admin Portal/);
  assert.match(text, /Restricted access/);
  assert.match(text, /Email Address/);
  assert.match(text, /Sign In Securely/);
});

test("visiting /#manage-portal-9f3a opens the admin portal login", async () => {
  const dom = loadApp("/#manage-portal-9f3a");
  await settle(dom, 250);
  assert.match(rootText(dom), /Admin Portal/);
});

test("clicking the Admin hash link opens the admin portal login", async () => {
  const dom = loadApp("/");
  await settle(dom, 250);
  assert.match(rootText(dom), /ENTER WEBSITE & SHOP CATALOG/);
  // Clicking the Admin link (hash #manage-portal-9f3a) must open the portal.
  dom.window.location.hash = "#manage-portal-9f3a";
  await settle(dom, 300);
  assert.match(rootText(dom), /Admin Portal/);
});

test("/ renders the entry gateway for fresh visitors", async () => {
  const dom = loadApp("/");
  await settle(dom, 250);
  assert.match(rootText(dom), /ENTER WEBSITE & SHOP CATALOG/);
});

test("/products shows the gateway first, then the products view after entering", async () => {
  const dom = loadApp("/products");
  await settle(dom, 250);
  // Deep links land on the entry gateway by design...
  assert.match(rootText(dom), /ENTER WEBSITE & SHOP CATALOG/);
  // ...and entering the store reveals the products view.
  const enter = [...dom.window.document.querySelectorAll("button")].find((b) =>
    b.textContent.includes("ENTER WEBSITE & SHOP CATALOG"),
  );
  assert.ok(enter, "gateway enter button should be present");
  enter.click();
  // The enter-store splash plays for ~1s before the store renders.
  await settle(dom, 1300);
  assert.match(rootText(dom), /Products/);
});

test("admin login with correct credentials opens the dashboard", async () => {
  const dom = loadApp("/manage-portal-9f3a");
  await settle(dom, 350);
  const { window } = dom;
  const doc = window.document;

  const email = doc.querySelector('input[type="email"]');
  const password = doc.querySelector('input[type="password"]');
  assert.ok(email, "email input should be present on the login form");
  assert.ok(password, "password input should be present on the login form");

  // Dispatch React-compatible input events so state updates.
  const setValue = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  setValue(email, "habeebc84@gmail.com");
  setValue(password, "admin123");

  doc.querySelector("form").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  await settle(dom, 400);

  assert.match(rootText(dom), /HSN Command Center/);
});
