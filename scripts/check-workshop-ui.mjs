import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";

// Usage: node scripts/check-workshop-ui.mjs [baseUrl] [outDir]
const base = (process.argv[2] ?? "http://127.0.0.1:4174/").replace(/\/?$/, "/");
const out = process.argv[3] ?? "screenshots/workshop-ui";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const runScenario = async (width, height, tag, scenario) => {
  const touch = tag !== "desktop";
  const context = await browser.newContext({
    viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(`${tag}: ${error.message}`));
    const button = (name) => page.getByRole("button", { name, exact: true });
    const activate = locator => touch ? locator.tap() : locator.click();
    const state = () => page.evaluate(() => ({
      pins: window.__temari.pinDump(),
      pinState: window.__temari.pinState(),
      kagari: window.__temari.kagari(),
    }));
    const assertFocus = async (name) => {
      assert.equal(await button(name).evaluate(el => el === document.activeElement), true,
        `${tag}: focus returns to ${name}`);
    };
    const assertDialog = async (title) => {
      const panel = page.getByRole("dialog", { name: title, exact: true });
      await panel.waitFor();
      assert.equal(await page.getByRole("dialog").count(), 1, `${tag}: only one dialog is open`);
      assert.equal(await panel.evaluate(el => el instanceof HTMLDialogElement && el.matches(":modal")), true,
        `${tag}: ${title} remains a native modal after opening`);
      assert.equal(await panel.evaluate(el => el.contains(document.activeElement)), true, `${tag}: focus enters the modal`);
      const fits = await panel.evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight &&
          el.scrollWidth <= el.clientWidth;
      });
      assert.equal(fits, true, `${tag}: ${title} fits without horizontal clipping`);
      for (const control of await panel.locator("button:enabled").all()) {
        if (await control.isVisible()) await control.click({ trial: true });
      }
      return panel;
    };
    const openPanel = async (name, title) => {
      await activate(button(name));
      return assertDialog(title);
    };
    const closePanel = async (panel, trigger) => {
      await activate(panel.getByRole("button", { name: "Закрыть панель", exact: true }));
      await panel.waitFor({ state: "hidden" });
      await assertFocus(trigger);
    };
    const assertCanvasClear = async () => {
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.getByRole("button", { name: /^Цвет основы \d$/ }).count(), 0);
      assert.equal(await page.getByRole("button", { name: /^(Красная|Золотая|Светлая|Тёмная|Синяя) нить/ }).count(), 0);
      assert.equal(await button("Кику здесь").count(), 0, "preparation belongs inside the pattern dialog");
      const probes = await page.locator("canvas").evaluate(canvas => {
        const r = canvas.getBoundingClientRect();
        return [0.3, 0.5, 0.7].flatMap(y => [0.25, 0.5, 0.75].map(x => {
          const px = r.left + r.width * x, py = r.top + r.height * y;
          const hit = document.elementFromPoint(px, py);
          return { x: px, y: py, clear: hit === canvas, hit: hit?.tagName };
        }));
      });
      assert.ok(probes.every(point => point.clear), `${tag}: no permanent sidebar covers the working canvas: ${JSON.stringify(probes)}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    };

    await page.goto(base);
    await button("Узор").waitFor();
    await page.waitForFunction(() => window.__temari?.pinState);
    await assertCanvasClear();
    const undo = button("Отменить");
    assert.equal(await undo.evaluate(el => el instanceof HTMLButtonElement && el.disabled), true,
      `${tag}: unavailable undo is natively disabled`);
    assert.equal(await undo.getAttribute("aria-pressed"), null, `${tag}: undo is not a toggle`);
    const initial = await state();
    assert.equal(await button("Выбрать узор").isEnabled(), true);
    assert.equal(await button("Линии").count(), 0);
    const panels = [["Узор", "Узор и разметка"], ["Нити", "Нити и основа"], ["Ещё", "Действия"]];
    if (scenario === "help") {
      const openHelp = async (tab, title) => {
        const pattern = await openPanel("Узор", "Узор и разметка");
        await activate(pattern.getByRole("button", { name: tab, exact: true }));
        const original = await pattern.elementHandle();
        assert.ok(original);
        await activate(pattern.getByRole("button", { name: title, exact: true }));
        const help = page.getByRole("dialog", { name: title, exact: true });
        await help.waitFor();
        assert.equal(await page.getByRole("dialog").count(), 1);
        assert.equal(await original.evaluate(el => el.isConnected && el.matches(":modal")), true,
          `${tag}: contextual help stays in the original native dialog`);
        await original.dispose();
        assert.equal(await help.getByRole("link", { name: "Подробнее о разметке и вышивке →", exact: true }).getAttribute("href"),
          "./design.html#jiwari");
        await page.screenshot({
          path: `${out}/${tag}-help-${tab === "Разметка" ? "marking" : title === "Как шьётся кику" ? "kiku" : "sketch"}.png`,
          animations: "disabled",
        });
        return help;
      };
      const followDocumentation = async (link, anchor) => {
        assert.equal(await link.getAttribute("href"), `./design.html#${anchor}`);
        const [response] = await Promise.all([
          page.waitForResponse(response => response.request().isNavigationRequest() &&
            new URL(response.url()).pathname.endsWith("/design.html")),
          activate(link),
        ]);
        assert.equal(response.status(), 200);
        await page.waitForURL(new URL(`design.html#${anchor}`, base).href);
        await page.locator(`#${anchor}`).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      };
      let help = await openHelp("Узоры", "Как рисовать эскиз");
      assert.match(await help.innerText(), /«Линии» соединяют две булавки/);
      await closePanel(help, "Узор");
      help = await openHelp("Разметка", "Как читать разметку");
      assert.match(await help.innerText(), /Разметка, или дзивари/);
      await closePanel(help, "Узор");

      const pattern = await openPanel("Узор", "Узор и разметка");
      await activate(pattern.getByRole("button", { name: "Узоры", exact: true }));
      await activate(pattern.getByRole("button", { name: "Кику здесь", exact: true }));
      await pattern.waitFor({ state: "hidden" });
      help = await openHelp("Узоры", "Как шьётся кику");
      assert.match(await help.innerText(), /двумя нитями по четыре лепестка/);
      await followDocumentation(help.getByRole("link", { name: "Подробнее о разметке и вышивке →", exact: true }), "jiwari");

      await page.goto(base);
      await button("Ещё").waitFor();
      const more = await openPanel("Ещё", "Действия");
      await followDocumentation(more.getByRole("link", { name: "О стенде и ограничениях", exact: true }), "interface");
      await page.screenshot({ path: `${out}/${tag}-design-interface.png`, animations: "disabled" });
      return;
    }
    if (scenario === "keyboard") {
      await activate(button("Выбрать узор"));
      const initialPattern = await assertDialog("Узор и разметка");
      await closePanel(initialPattern, "Выбрать узор");

      for (const [name, title] of panels) {
        await button(name).focus();
        await page.keyboard.press("Enter");
        const panel = await assertDialog(title);
        const close = panel.getByRole("button", { name: "Закрыть панель", exact: true });
        await close.focus();
        await page.keyboard.press("Tab");
        assert.equal(await panel.evaluate(el => el.contains(document.activeElement)), true,
          `${tag}: keyboard navigation stays in ${title}`);
        await page.keyboard.press("Shift+Tab");
        assert.equal(await close.evaluate(el => el === document.activeElement), true);
        await page.keyboard.press("Escape");
        await panel.waitFor({ state: "hidden" });
        await assertFocus(name);
        await assertCanvasClear();
      }
      assert.deepEqual(await state(), initial, `${tag}: keyboard dialog navigation does not alter the work`);
      return;
    }
    if (scenario === "panels") {
      for (const [name, title] of panels) {
        let panel = await openPanel(name, title);
        await page.screenshot({ path: `${out}/${tag}-${name === "Узор" ? "pattern" : name === "Нити" ? "threads" : "more"}.png`, animations: "disabled" });
        await closePanel(panel, name);
        panel = await openPanel(name, title);
        const rect = await panel.boundingBox();
        assert.ok(rect);
        const outside = [
          { x: 2, y: 2 }, { x: width - 2, y: 2 },
          { x: 2, y: height - 2 }, { x: width - 2, y: height - 2 },
        ].find(p => p.x < rect.x || p.x > rect.x + rect.width || p.y < rect.y || p.y > rect.y + rect.height);
        assert.ok(outside, `${tag}: the modal leaves an accessible backdrop`);
        const before = await state();
        if (touch) await page.touchscreen.tap(outside.x, outside.y);
        else await page.mouse.click(outside.x, outside.y);
        await panel.waitFor({ state: "hidden" });
        await assertFocus(name);
        assert.deepEqual(await state(), before, `${tag}: dismissing the backdrop cannot act on the canvas`);
        await assertCanvasClear();
      }
      assert.deepEqual(await state(), initial, `${tag}: opening and dismissing panels does not alter the work`);
      return;
    }

    const canvas = await page.locator("canvas").boundingBox();
    assert.ok(canvas && canvas.height >= 230);
    for (const [dx, dy] of [[-30, -20], [40, 25]]) {
      const x = canvas.x + canvas.width / 2 + dx, y = canvas.y + canvas.height / 2 + dy;
      assert.equal(await page.evaluate(({ x, y }) =>
        document.elementFromPoint(x, y) === document.querySelector("canvas"), { x, y }), true);
      if (touch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
    }
    await page.waitForFunction(() => window.__temari.pins() === 2);
    assert.equal(await undo.isEnabled(), true);
    assert.equal(await undo.getAttribute("aria-pressed"), null);
    const work = await state();
    let more = await openPanel("Ещё", "Действия");
    assert.equal(await more.getByRole("button", { name: "Сбросить работу", exact: true }).count(), 0);
    await activate(more.getByRole("button", { name: "Сброс", exact: true }));
    let confirmation = page.locator("dialog[open]");
    assert.equal(await confirmation.count(), 1, "reset confirmation uses the same modal");
    assert.equal(await confirmation.getByRole("button", { name: "Сбросить работу", exact: true }).isEnabled(), true);
    assert.deepEqual(await state(), work, "requesting reset cannot erase work");
    await page.screenshot({ path: `${out}/${tag}-reset-confirmation.png`, animations: "disabled" });
    await activate(confirmation.getByRole("button", { name: "Отмена", exact: true }));
    assert.deepEqual(await state(), work, "cancel preserves all work");
    assert.equal(await page.getByRole("button", { name: "Сбросить работу", exact: true }).count(), 0);
    if (await confirmation.isVisible()) await closePanel(confirmation, "Ещё");

    more = await openPanel("Ещё", "Действия");
    await activate(more.getByRole("button", { name: "Сброс", exact: true }));
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await assertFocus("Ещё");
    assert.deepEqual(await state(), work, "Escape cancels a pending reset");

    more = await openPanel("Ещё", "Действия");
    assert.equal(await more.getByRole("button", { name: "Сбросить работу", exact: true }).count(), 0,
      "a dismissed confirmation is not left armed");
    await activate(more.getByRole("button", { name: "Сброс", exact: true }));
    confirmation = page.locator("dialog[open]");
    await activate(confirmation.getByRole("button", { name: "Сбросить работу", exact: true }));
    await page.waitForFunction(() => window.__temari.pins() === 0);
    const reset = await state();
    assert.equal(reset.pinState.arcs, 0);
    assert.equal(reset.pinState.sewn, 0);
    assert.equal(reset.pinState.jiwariOn, false);
    assert.equal(reset.kagari.n, 0);
    assert.equal(reset.kagari.kept, 0);
    assert.equal(reset.kagari.motif, "none");
    if (await confirmation.isVisible()) await closePanel(confirmation, "Ещё");
    await assertCanvasClear();
    await page.screenshot({ path: `${out}/${tag}-workshop.png`, animations: "disabled" });
  } finally {
    await context.close();
  }
};
try {
  for (const [width, height, tag] of [[1280, 900, "desktop"], [390, 844, "phone"], [320, 640, "narrow"]]) {
    for (const scenario of ["keyboard", "panels", "reset", "help"]) {
      await test(`${tag}: ${scenario}`, () => runScenario(width, height, tag, scenario));
    }
  }
  assert.deepEqual(errors, [], "browser errors");
  console.log(JSON.stringify({ base, screenshots: out, errors }));
} finally {
  await browser.close();
}
