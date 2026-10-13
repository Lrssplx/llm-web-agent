import { chromium } from 'playwright';

/**
 * BrowserController
 * -------------------
 * Camada de "corpo" do agente: expõe percepção (getState) e ações
 * (click, type, navigate, scroll, ...) sobre uma página Playwright.
 *
 * A cada ação, a página é re-escaneada e cada elemento interativo
 * visível recebe um atributo data-agent-id="N". O LLM referencia
 * elementos só por esse número inteiro (abordagem "set-of-marks"),
 * evitando que ele precise inventar seletores CSS/XPath frágeis.
 */
export class BrowserController {
  constructor({ headless = true, viewport = { width: 1280, height: 800 } } = {}) {
    this.headless = headless;
    this.viewport = viewport;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async launch() {
    this.browser = await chromium.launch({ headless: this.headless });
    this.context = await this.browser.newContext({ viewport: this.viewport });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(15000);
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  async _settle() {
    // pequena espera para deixar re-renderizações/animações assentarem
    await this.page.waitForTimeout(400).catch(() => {});
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
  }

  async navigate(url) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this._settle();
    return this.getState();
  }

  /**
   * Escaneia a página e devolve um snapshot enxuto: URL, título e
   * lista de elementos interativos visíveis com um id numérico.
   */
  async getState() {
    const elements = await this.page.evaluate(() => {
      const SELECTOR =
        'a, button, input, textarea, select, [role="button"], [role="link"], ' +
        '[role="tab"], [role="menuitem"], [role="checkbox"], [onclick], [contenteditable="true"]';
      const nodes = Array.from(document.querySelectorAll(SELECTOR));

      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0'
        );
      };

      let idx = 0;
      const result = [];
      for (const el of nodes) {
        if (!isVisible(el)) continue;
        el.setAttribute('data-agent-id', String(idx));
        const tag = el.tagName.toLowerCase();
        const rawText =
          el.innerText ||
          el.getAttribute('value') ||
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          '';
        result.push({
          id: idx,
          tag,
          type: el.getAttribute('type') || null,
          role: el.getAttribute('role') || null,
          text: rawText.trim().replace(/\s+/g, ' ').slice(0, 120),
          href: tag === 'a' ? el.getAttribute('href') : undefined,
        });
        idx++;
      }
      return result;
    });

    return {
      url: this.page.url(),
      title: await this.page.title(),
      elements,
    };
  }

  async click(id) {
    const el = this.page.locator(`[data-agent-id="${id}"]`);
    await el.scrollIntoViewIfNeeded();
    await el.click({ timeout: 10000 });
    await this._settle();
    return this.getState();
  }

  async type(id, text, { clear = true } = {}) {
    const el = this.page.locator(`[data-agent-id="${id}"]`);
    await el.scrollIntoViewIfNeeded();
    if (clear) {
      await el.fill('').catch(() => {});
    }
    await el.type(text, { delay: 15 });
    await this._settle();
    return this.getState();
  }

  async pressKey(key) {
    await this.page.keyboard.press(key);
    await this._settle();
    return this.getState();
  }

  async scroll(direction = 'down') {
    const delta = direction === 'down' ? 800 : -800;
    await this.page.mouse.wheel(0, delta);
    await this._settle();
    return this.getState();
  }

  async extractText() {
    const text = await this.page.evaluate(() => document.body.innerText);
    return text.slice(0, 6000);
  }

  async screenshot(path) {
    await this.page.screenshot({ path, fullPage: false });
    return path;
  }
}
