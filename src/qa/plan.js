
import 'dotenv/config';

import fs from 'node:fs/promises';
import path from 'node:path';

import { TestPlanner } from './planner.js';

async function main() {
  const task = process.argv
    .slice(2)
    .join(' ')
    .trim();

  if (!task) {
    console.error(
      'Uso: node src/qa/plan.js "missão de QA"'
    );
    process.exitCode = 1;
    return;
  }

  const planner = new TestPlanner({
    maxScenarios: Number(
      process.env.QA_MAX_SCENARIOS || 5
    ),
  });

  const plan = await planner.generatePlan({
    task,
    baseUrl: process.env.QA_BASE_URL || '',
    requirements:
      process.env.QA_REQUIREMENTS || '',
  });

  console.log('\n=== PLANO DE TESTES ===\n');
  console.log(`Funcionalidade: ${plan.feature}`);
  console.log(`Objetivo: ${plan.objective}`);
  console.log(
    `Total de cenários: ${plan.scenarios.length}`
  );

  for (const scenario of plan.scenarios) {
    console.log(
      `\n[${scenario.id}] ${scenario.title}`
    );
    console.log(`Tipo: ${scenario.type}`);
    console.log(
      `Prioridade: ${scenario.priority}`
    );
    console.log(
      `Origem: ${scenario.expectationSource}`
    );
    console.log('Passos:');

    scenario.steps.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step}`);
    });

    console.log(
      `Esperado: ${scenario.expectedResult}`
    );
  }

  if (plan.assumptions.length > 0) {
    console.log('\n=== DÚVIDAS E HIPÓTESES ===');
    plan.assumptions.forEach((item) => {
      console.log(`- ${item}`);
    });
  }

  const outputDir = path.join(
    process.cwd(),
    'artifacts',
    'plans'
  );

  await fs.mkdir(outputDir, {
    recursive: true,
  });

  const filename = [
    'test-plan',
    new Date().toISOString()
      .replace(/[:.]/g, '-'),
    '.json',
  ].join('');

  const filePath = path.join(
    outputDir,
    filename
  );

  await fs.writeFile(
    filePath,
    JSON.stringify(plan, null, 2),
    'utf8'
  );

  console.log(
    '\nPlano salvo em:',
    filePath
  );

  console.log(
    '\nTokens de saída:',
    plan.metrics.outputTokens
  );
}

main().catch((error) => {
  console.error(
    'Erro ao gerar plano:',
    error.message
  );

  process.exitCode = 1;
});
