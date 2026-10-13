
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

export class BrowserController {
  constructor({
    headless = true,
    viewport = { width: 1280, height: 800 },
    artifactsDir = 'artifacts',
    enableTracing = true,
  } = {}) {
    this.headless = headless;
    this.viewport = viewport;
    this.artifactsDir = artifactsDir;
    this.enableTracing = enableTracing;

    this.browser = null;
    this.context = null;
    this.page = null;

    this.snapshotId = 0;
    this.actionCount = 0;
    this.tracingStarted = false;

    this.consoleErrors = [];
    this.pageErrors = [];
    this.actionHistory = [];
  }

  async launch() {
    await fs.mkdir(this.artifactsDir, {
      recursive: true,
    });

    this.browser = await chromium.launch({
      headless: this.headless,
    });

    this.context = await this.browser.newContext({
      viewport: this.viewport,
    });

    if (this.enableTracing) {
      await this.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: false,
      });

      this.tracingStarted = true;
    }

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(15000);

    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.consoleErrors.push({
          timestamp: new Date().toISOString(),
          message: msg.text().slice(0, 1000),
        });
      }
    });

    this.page.on('pageerror', (error) => {
      this.pageErrors.push({
        timestamp: new Date().toISOString(),
        message: error.message.slice(0, 1000),
      });
    });
  }

  async close() {
    try {
      if (this.tracingStarted) {
        await this.context.tracing.stop({
          path: path.join(
            this.artifactsDir,
            'trace.zip'
          ),
        });

        this.tracingStarted = false;
      }

      await this.saveExecutionLog();
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }

  async _settle() {
    await this.page
      .waitForLoadState('domcontentloaded', {
        timeout: 3000,
      })
      .catch(() => {});

    await this.page.waitForTimeout(250);
  }

  async recordAction(name, operation) {
    const startedAt = Date.now();
    let success = false;

    try {
      const result = await operation();
      success = true;
      return result;
    } finally {
      this.actionHistory.push({
        action: name,
        success,
        durationMs: Date.now() - startedAt,
        url: this.page?.url() ?? null,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async navigate(url) {
    return this.recordAction('navigate', async () => {
      const target = new URL(url);

      if (!['https:', 'http:'].includes(target.protocol)) {
        throw new Error('Protocolo não permitido.');
      }

      await this.page.goto(target.href, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      await this._settle();
      return this.getState();
    });
  }

  async getState() {
    const snapshotId = String(++this.snapshotId);

    const elements = await this.page.evaluate(
      ({ snapshotId }) => {
        const previous = window.__qaAgentRegistry;

        if (previous?.observer) {
          previous.observer.disconnect();
        }

        const selector = [
          'a',
          'button',
          'input',
          'textarea',
          'select',
          '[role="button"]',
          '[role="link"]',
          '[role="tab"]',
          '[role="menuitem"]',
          '[role="checkbox"]',
          '[onclick]',
          '[contenteditable="true"]',
        ].join(', ');

        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);

          return (
            el.isConnected &&
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0'
          );
        };

        const nodes = Array.from(
          document.querySelectorAll(selector)
        );

        const registry = {
          snapshotId,
          stale: false,
          elements: new Map(),
          observer: null,
        };

        const result = [];

        for (const el of nodes) {
          if (!isVisible(el)) continue;
          if (el.matches(':disabled')) continue;

          const id = result.length;

          el.setAttribute('data-agent-id', String(id));
          el.setAttribute(
            'data-agent-snapshot',
            snapshotId
          );

          registry.elements.set(id, el);

          const tag = el.tagName.toLowerCase();

          const rawText =
            el.innerText ||
            el.getAttribute('aria-label') ||
            el.getAttribute('placeholder') ||
            el.getAttribute('name') ||
            '';

          result.push({
            id,
            tag,
            type: el.getAttribute('type') || null,
            role: el.getAttribute('role') || null,
            text: String(rawText)
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 120),
            href: tag === 'a'
              ? el.getAttribute('href')
              : undefined,
          });
        }

        registry.observer = new MutationObserver(
          (mutations) => {
            if (mutations.length > 0) {
              registry.stale = true;
            }
          }
        );

        registry.observer.observe(
          document.documentElement,
          {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: [
              'class',
              'style',
              'hidden',
              'disabled',
              'aria-hidden',
              'aria-disabled',
              'role',
              'type',
              'href',
              'placeholder',
            ],
          }
        );

        window.__qaAgentRegistry = registry;

        return result;
      },
      { snapshotId }
    );

    return {
      url: this.page.url(),
      title: await this.page.title(),
      snapshotId,
      elements,
    };
  }

  async getValidatedLocator(id) {
    if (!Number.isInteger(id) || id < 0) {
      throw new Error(`ID inválido: ${id}`);
    }

    const validation = await this.page.evaluate(
      (elementId) => {
        const registry = window.__qaAgentRegistry;

        if (!registry) {
          return {
            valid: false,
            reason: 'Nenhum snapshot disponível.',
          };
        }

        if (
          registry.observer?.takeRecords().length > 0
        ) {
          registry.stale = true;
        }

        if (registry.stale) {
          return {
            valid: false,
            reason: 'DOM alterado após o snapshot.',
          };
        }

        const element = registry.elements.get(
          elementId
        );

        if (!element || !element.isConnected) {
          return {
            valid: false,
            reason: 'Elemento não encontrado.',
          };
        }

        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);

        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          style.display === 'none' ||
          style.visibility === 'hidden'
        ) {
          return {
            valid: false,
            reason: 'Elemento não está visível.',
          };
        }

        if (element.matches(':disabled')) {
          return {
            valid: false,
            reason: 'Elemento está desabilitado.',
          };
        }

        return {
          valid: true,
          snapshotId: registry.snapshotId,
        };
      },
      id
    );

    if (!validation.valid) {
      const state = await this.getState();

      throw new Error(
        `ID desatualizado: ${validation.reason} ` +
        `Solicite novamente o estado da página. ` +
        `Novo snapshot: ${state.snapshotId}. ` +
        `Elementos: ${JSON.stringify(state.elements)}`
      );
    }

    return this.page.locator(
      `[data-agent-snapshot="${validation.snapshotId}"]` +
      `[data-agent-id="${id}"]`
    );
  }

  async click(id) {
    return this.recordAction('click', async () => {
      const locator = await this.getValidatedLocator(id);

      await locator.scrollIntoViewIfNeeded();
      await locator.click({ timeout: 10000 });

      await this._settle();
      return this.getState();
    });
  }

  async type(id, text, { clear = true } = {}) {
    return this.recordAction('type', async () => {
      const locator = await this.getValidatedLocator(id);

      await locator.scrollIntoViewIfNeeded();

      if (clear) {
        await locator.fill('');
      }

      await locator.pressSequentially(
        String(text),
        { delay: 15 }
      );

      await this._settle();
      return this.getState();
    });
  }

  async pressKey(key) {
    return this.recordAction(
      'press_key',
      async () => {
        await this.page.keyboard.press(key);

        await this._settle();
        return this.getState();
      }
    );
  }

  async scroll(direction = 'down') {
    return this.recordAction('scroll', async () => {
      const delta =
        direction === 'down' ? 800 : -800;

      await this.page.mouse.wheel(0, delta);

      await this._settle();
      return this.getState();
    });
  }

  async extractText() {
    return this.recordAction(
      'extract_text',
      async () => {
        const text = await this.page.evaluate(
          () => document.body?.innerText || ''
        );

        return text.slice(0, 6000);
      }
    );
  }

  async screenshot(filename = 'evidence.png') {
    await fs.mkdir(this.artifactsDir, {
      recursive: true,
    });

    const safeFilename = path.basename(filename);

    const filePath = path.join(
      this.artifactsDir,
      safeFilename
    );

    await this.page.screenshot({
      path: filePath,
      fullPage: false,
    });

    return filePath;
  }

  async saveExecutionLog() {
    await fs.mkdir(this.artifactsDir, {
      recursive: true,
    });

    const report = {
      generatedAt: new Date().toISOString(),
      finalUrl: this.page?.url() ?? null,
      totalActions: this.actionHistory.length,
      actions: this.actionHistory,
      consoleErrors: this.consoleErrors,
      pageErrors: this.pageErrors,
    };

    const filePath = path.join(
      this.artifactsDir,
      'execution-log.json'
    );

    await fs.writeFile(
      filePath,
      JSON.stringify(report, null, 2),
      'utf8'
    );

    return filePath;
  }
}
