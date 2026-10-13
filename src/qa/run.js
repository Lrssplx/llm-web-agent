
import 'dotenv/config';

import { QAOrchestrator } from './orchestrator.js';

async function main() {
  // Recebe a missão informada pelo usuário
  const task = process.argv
    .slice(2)
    .join(' ')
    .trim();

  if (!task) {
    console.error(
      'Uso: node src/qa/run.js "missão de QA"'
    );

    process.exitCode = 1;
    return;
  }

  // Configurações do ambiente
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.QA_BASE_URL;

  const mode = process.env.QA_MODE || 'regression';

  const scenarioKeys = (
    process.env.QA_SCENARIO_KEYS || ''
  )
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

  const maxScenarios = Number(
    process.env.QA_MAX_SCENARIOS || 5
  );

  const maxSteps = Number(
    process.env.MAX_STEPS || 25
  );

  const maxDurationMs = Number(
    process.env.MAX_DURATION_MS || 120000
  );

  const headless =
    process.env.HEADLESS !== 'false';

  const requirements =
    process.env.QA_REQUIREMENTS || '';

  // Validações iniciais
  if (!apiKey) {
    console.error(
      'Erro: ANTHROPIC_API_KEY não configurada.'
    );

    process.exitCode = 1;
    return;
  }

  if (!baseUrl) {
    console.error(
      'Erro: QA_BASE_URL não configurada.'
    );

    process.exitCode = 1;
    return;
  }

  if (!['regression', 'exploratory'].includes(mode)) {
    console.error(
      `Erro: modo de QA inválido: ${mode}`
    );

    process.exitCode = 1;
    return;
  }

  console.log('\n=================================');
  console.log('     AUTONOMOUS QA AGENT 2.0');
  console.log('=================================');

  console.log('\n=== CONFIGURAÇÃO ===');

  console.log('Modo:', mode);
  console.log('Aplicação:', baseUrl);
  console.log('Missão:', task);
  console.log('Headless:', headless);
  console.log('Máximo de passos:', maxSteps);
  console.log('Tempo máximo:', maxDurationMs, 'ms');

  if (mode === 'regression') {
    console.log(
      'Cenários selecionados:',
      scenarioKeys.length > 0
        ? scenarioKeys.join(', ')
        : 'Todos os cenários do catálogo'
    );
  } else {
    console.log(
      'Máximo de cenários exploratórios:',
      maxScenarios
    );
  }

  // Cria o orquestrador
  const orchestrator = new QAOrchestrator({
    apiKey,
    baseUrl,
    requirements,
    maxScenarios,
    maxSteps,
    maxDurationMs,
    headless,
    mode,
    scenarioKeys,
  });

  console.log('\n=== INICIANDO EXECUÇÃO ===');

  // Executa a missão
  const result = await orchestrator.run(task);

  console.log('\n=== RESULTADOS DOS TESTES ===');

  console.table(
    result.report.scenarios.map((scenario) => ({
      ID: scenario.id,
      Chave: scenario.scenarioKey || 'EXPLORATORY',
      Titulo: scenario.title,
      Executado: scenario.executionCompleted,
      Status: scenario.status,
    }))
  );

  // Resumo geral
  console.log('\n=== RESUMO GERAL ===');

  console.log({
    modo: mode,
    totalScenarios: result.report.totalScenarios,
    completed: result.report.completedExecutions,
    passed: result.report.passed,
    failed: result.report.failed,
    inconclusive: result.report.inconclusive,
  });

  // Métricas do agente
  const totalMetrics = result.report.scenarios.reduce(
    (acc, scenario) => {
      const metrics = scenario.metrics;

      if (!metrics) {
        return acc;
      }

      acc.inputTokens += metrics.inputTokens || 0;
      acc.outputTokens += metrics.outputTokens || 0;
      acc.cacheCreationTokens +=
        metrics.cacheCreationTokens || 0;
      acc.cacheReadTokens +=
        metrics.cacheReadTokens || 0;
      acc.totalSteps += metrics.totalSteps || 0;
      acc.durationMs += metrics.durationMs || 0;

      return acc;
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalSteps: 0,
      durationMs: 0,
    }
  );

  console.log('\n=== MÉTRICAS DO AGENTE ===');

  console.table({
    'Tokens de entrada': totalMetrics.inputTokens,
    'Tokens de saída': totalMetrics.outputTokens,
    'Tokens criação cache':
      totalMetrics.cacheCreationTokens,
    'Tokens leitura cache':
      totalMetrics.cacheReadTokens,
    'Passos executados': totalMetrics.totalSteps,
    'Duração acumulada (s)':
      (totalMetrics.durationMs / 1000).toFixed(2),
  });

  // Local das evidências
  console.log('\n=== EVIDÊNCIAS ===');

  console.log(
    'Relatórios e evidências disponíveis em:'
  );

  console.log(result.runDir);

  // Resultado final
  if (result.report.failed > 0) {
    console.log(
      '\nResultado: existem testes com falha.'
    );
    process.exitCode = 1;
  } else if (result.report.inconclusive > 0) {
    console.log(
      '\nResultado: existem testes inconclusivos.'
    );
    process.exitCode = 2;
  } else {
    console.log(
      '\nResultado: todos os testes foram aprovados!'
    );
  }
}

// Tratamento global de erros
main().catch((error) => {
  console.error('\n=== ERRO FATAL ===');
  console.error(error.stack || error.message);

  process.exitCode = 1;
});
