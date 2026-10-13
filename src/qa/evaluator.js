
import { expect } from '@playwright/test';

export class TestEvaluator {
  constructor({ timeout = 5000 } = {}) {
    this.timeout = timeout;
  }

  async evaluate({
    page,
    scenario,
    executionCompleted,
    expectation,
  }) {
    const base = {
      scenarioId: scenario.id,
      status: 'INCONCLUSIVE',
      expected: expectation?.value ?? null,
      observed: null,
      reason: '',
      evaluatedAt: new Date().toISOString(),
    };

    if (!executionCompleted) {
      return {
        ...base,
        reason: 'O agente não concluiu a execução.',
      };
    }

    if (
      !page ||
      page.isClosed()
    ) {
      return {
        ...base,
        reason: 'Página indisponível para avaliação.',
      };
    }

    if (!expectation) {
      return {
        ...base,
        reason: 'Não há expectativa aprovada.',
      };
    }

    if (
      !scenario.scenarioKey ||
      expectation.scenarioKey !== scenario.scenarioKey
    ) {
      return {
        ...base,
        reason:
          'A expectativa não corresponde à chave estável do cenário.',
      };
    }


        
    if (
      expectation.approved !== true ||
      expectation.source !== 'requirement' ||
      scenario.expectationSource !== 'requirement'
    ) {
      return {
        ...base,
        reason:
          'Expectativa não aprovada ou não confirmada.',
      };
    }

    const allowedTypes = [
      'text_visible',
      'text_absent',
      'url_contains',
    ];

    if (
      !allowedTypes.includes(expectation.type) ||
      typeof expectation.value !== 'string' ||
      !expectation.value.trim()
    ) {
      return {
        ...base,
        reason: 'Critério de avaliação inválido.',
      };
    }

    // Captura uma observação independente
    // do resumo produzido pelo Claude.
    try {
      switch (expectation.type) {
        case 'text_visible': {
          const locator = page.getByText(
            expectation.value,
            { exact: true }
          );

          await expect(locator).toBeVisible({
            timeout: this.timeout,
          });

          return {
            ...base,
            status: 'PASS',
            observed: 'Texto esperado visível.',
            reason: 'Assertion de visibilidade atendida.',
          };
        }

        case 'text_absent': {
          const locator = page.getByText(
            expectation.value,
            { exact: true }
          );

          await expect(locator).toBeHidden({
            timeout: this.timeout,
          });

          return {
            ...base,
            status: 'PASS',
            observed: 'Texto esperado ausente ou oculto.',
            reason: 'Assertion de ausência atendida.',
          };
        }

        case 'url_contains': {
          const expectedPart = expectation.value;

          await expect(page).toHaveURL(
            (url) => url.href.includes(expectedPart),
            { timeout: this.timeout }
          );

          return {
            ...base,
            status: 'PASS',
            observed: page.url(),
            reason: 'URL corresponde ao critério.',
          };
        }
      }
    } catch (error) {
      const observed = {
        url: page.url(),
      };

      try {
        observed.visibleText = (
          await page.locator('body').innerText({
            timeout: 2000,
          })
        ).slice(0, 500);
      } catch {
        observed.visibleText = null;
      }

      // Somente uma falha de assertion permite FAIL.
      // Erros inesperados permanecem inconclusivos.
      const assertionFailed =
        error.name === 'AssertionError' ||
        error.matcherResult !== undefined;

      return {
        ...base,
        status: assertionFailed
          ? 'FAIL'
          : 'INCONCLUSIVE',
        observed,
        reason: assertionFailed
          ? 'Critério aprovado não foi atendido.'
          : `Erro durante avaliação: ${error.message}`,
      };
    }
  }
}
