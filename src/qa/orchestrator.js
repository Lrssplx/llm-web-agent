
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getCatalogScenarios
} from './catalog.js';

import { BrowserController } from '../browser.js';
import { WebAgent } from '../agent.js';
import { TestPlanner } from './planner.js';
import { TestEvaluator } from './evaluator.js';

export class QAOrchestrator {
  constructor({
    apiKey = process.env.ANTHROPIC_API_KEY,
    baseUrl = process.env.QA_BASE_URL,
    requirements = process.env.QA_REQUIREMENTS || '',
    maxScenarios = 5,
    maxSteps = 25,
    maxDurationMs = 120000,
    headless = true,
    mode = 'regression',
    scenarioKeys = [],
  } = {}) {
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY ausente.');
    }

    if (!baseUrl) {
      throw new Error('QA_BASE_URL ausente.');
    }

    const url = new URL(baseUrl);

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('URL inválida.');
    }
    
    if (!['regression', 'exploratory'].includes(mode)) {
      throw new Error(`Modo de QA inválido: ${mode}`);
    }

    this.mode = mode;
    this.scenarioKeys = scenarioKeys;

    this.apiKey = apiKey;
    this.baseUrl = url.href;
    this.requirements = requirements;
    this.maxScenarios = maxScenarios;
    this.maxSteps = maxSteps;
    this.maxDurationMs = maxDurationMs;
    this.headless = headless;

    this.planner = new TestPlanner({
      apiKey,
      maxScenarios,
    });

    this.evaluator = new TestEvaluator({
      timeout: 5000,
    });
  }

  async loadExpectations() {
    const filePath = path.resolve(
      'src/qa/expectations.json'
    );

    try {
      const content = await fs.readFile(
        filePath,
        'utf8'
      );

      const data = JSON.parse(content);

      return Array.isArray(data.expectations)
        ? data.expectations
        : [];
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  buildScenarioTask(scenario) {
    return `
MODO: EXECUÇÃO DE CENÁRIO DE QA

Aplicação:
${this.baseUrl}

Cenário:
${scenario.id} - ${scenario.title}
Identificador estável:
${scenario.scenarioKey ?? 'EXPLORATORY'}

Pré-condições:
${scenario.preconditions.join('\n') || 'Nenhuma'}

Passos:
${scenario.steps
  .map((step, index) => `${index + 1}. ${step}`)
  .join('\n')}

Resultado esperado:
${scenario.expectedResult}

Origem da expectativa:
${scenario.expectationSource}

REGRAS:
- Execute apenas este cenário.
- Utilize apenas aplicações autorizadas.
- Não invente resultados.
- Observe o comportamento após cada ação.
- Não realize ações destrutivas.
- Não interprete hipóteses como defeitos.
- Se faltarem dados, informe a limitação.
- Encerre usando finish.
- success=true significa que a investigação
  terminou, não que o teste passou.
`;
  }

  async executeScenario(
    scenario,
    runDir,
    expectations
  ) {
    const scenarioDir = path.join(
      runDir,
      scenario.id
    );

    await fs.mkdir(scenarioDir, {
      recursive: true,
    });

    const browser = new BrowserController({
      headless: this.headless,
      artifactsDir: scenarioDir,
      enableTracing: true,
    });

    const result = {
      id: scenario.id,
      title: scenario.title,
      type: scenario.type,
      priority: scenario.priority,
      expectedResult: scenario.expectedResult,
      expectationSource: scenario.expectationSource,
      executionCompleted: false,
      status: 'INCONCLUSIVE',
      evaluation: null,
      agentSummary: '',
      metrics: null,
      evidence: null,
      error: null,
      scenarioKey: scenario.scenarioKey ?? null,
    };

    try {
      await browser.launch();
      await browser.navigate(this.baseUrl);

      const agent = new WebAgent({
        browser,
        apiKey: this.apiKey,
        maxSteps: this.maxSteps,
        maxDurationMs: this.maxDurationMs,
        verbose: true,
      });

      const execution = await agent.run(
        this.buildScenarioTask(scenario)
      );

      result.executionCompleted =
        execution.success === true;

      result.agentSummary =
        execution.result || '';

      result.metrics = execution.metrics || null;

     
      const expectation = expectations.find(
        item =>
          scenario.scenarioKey &&
          item.scenarioKey === scenario.scenarioKey
      );

      result.evaluation =
        await this.evaluator.evaluate({
          page: browser.page,
          scenario,
          executionCompleted:
            result.executionCompleted,
          expectation,
        });

      result.status = result.evaluation.status;
    } catch (error) {
      result.error = error.message;
      result.status = 'INCONCLUSIVE';
    } finally {
      if (browser.page &&
          !browser.page.isClosed()) {
        try {
          result.evidence = await browser.screenshot(
            'evidence.png'
          );
        } catch (error) {
          result.error = [
            result.error,
            `Screenshot: ${error.message}`,
          ].filter(Boolean).join(' | ');
        }
      }

      try {
        await browser.close();
      } catch (error) {
        result.error = [
          result.error,
          `Fechamento: ${error.message}`,
        ].filter(Boolean).join(' | ');
      }
    }

    await fs.writeFile(
      path.join(scenarioDir, 'result.json'),
      JSON.stringify(result, null, 2),
      'utf8'
    );

    return result;
  }

  async run(task) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-');

    const runDir = path.join(
      'artifacts',
      `qa-run-${timestamp}`
    );

    await fs.mkdir(runDir, {
      recursive: true,
    });

    console.log('\n=== PLANEJANDO TESTES ===');

    
let plan;

if (this.mode === 'regression') {
  const scenarios = getCatalogScenarios(
    this.scenarioKeys
  );

    plan = {
      version: '2.1',
      createdAt: new Date().toISOString(),
      baseUrl: this.baseUrl,
      task,
      feature: 'Autenticação Swag Labs',
      objective: task,
      assumptions: [],
      scenarios,
    };
  } else {
    plan = await this.planner.generatePlan({
      task,
      baseUrl: this.baseUrl,
      requirements: this.requirements,
    });
  }


    await fs.writeFile(
      path.join(runDir, 'test-plan.json'),
      JSON.stringify(plan, null, 2),
      'utf8'
    );


const expectations = this.mode === 'regression'
  ? plan.scenarios.map((scenario) => ({
      scenarioKey: scenario.scenarioKey,
      approved: true,
      source: scenario.expectationSource,
      type: scenario.expectation.type,
      value: scenario.expectation.value,
    }))
  : [];

    const results = [];

    for (const scenario of plan.scenarios) {
      console.log(
        `\n=== EXECUTANDO ${scenario.id} ===`
      );

      console.log(scenario.title);

      const result = await this.executeScenario(
        scenario,
        runDir,
        expectations
      );

      results.push(result);

      console.log(`Resultado QA: ${result.status}`);
      console.log(
        `Motivo: ${
          result.evaluation?.reason ||
          result.error ||
          'Sem avaliação'
        }`
      );
    }

    const report = {
      generatedAt: new Date().toISOString(),
      feature: plan.feature,
      objective: plan.objective,
      baseUrl: this.baseUrl,
      totalScenarios: results.length,
      mode: this.mode,
      completedExecutions: results.filter(
        (r) => r.executionCompleted
      ).length,
      passed: results.filter(
        (r) => r.status === 'PASS'
      ).length,
      failed: results.filter(
        (r) => r.status === 'FAIL'
      ).length,
      inconclusive: results.filter(
        (r) => r.status === 'INCONCLUSIVE'
      ).length,
      scenarios: results,
    };

    await fs.writeFile(
      path.join(runDir, 'report.json'),
      JSON.stringify(report, null, 2),
      'utf8'
    );

    return {
      plan,
      report,
      runDir,
    };
  }
}
