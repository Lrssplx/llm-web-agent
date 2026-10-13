
import 'dotenv/config';

import { BrowserController } from './browser.js';
import { WebAgent } from './agent.js';

async function main() {
  const task = process.argv
    .slice(2)
    .join(' ')
    .trim();

  if (!task) {
    console.error(
      'Uso: node src/index.js "descrição da tarefa"'
    );

    console.error(
      'Exemplo: node src/index.js ' +
      '"Acesse https://example.com e informe o título"'
    );

    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Defina ANTHROPIC_API_KEY no arquivo .env'
    );

    process.exit(1);
  }

  const headless =
    process.env.HEADLESS !== 'false';

  const maxSteps = Number(
    process.env.MAX_STEPS || 25
  );

  const maxDurationMs = Number(
    process.env.MAX_DURATION_MS || 120000
  );

  const browser = new BrowserController({
    headless,
  });

  try {
    await browser.launch();

    const agent = new WebAgent({
      browser,
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxSteps,
      maxDurationMs,
      verbose: true,

      onStep: async (
        step,
        { action, success, durationMs }
      ) => {
        console.log(
          `[STEP ${step}] ${action} | ` +
          `Status: ${success ? 'OK' : 'ERRO'} | ` +
          `Duração: ${durationMs}ms`
        );
      },
    });

    const result = await agent.run(task);

    
      try {
        const evidencePath = await browser.screenshot(
          'final-state.png'
        );

        console.log(
          '\nScreenshot salva em:',
          evidencePath
        );
      } catch (error) {
        console.error(
          'Não foi possível capturar a screenshot:',
          error.message
        );
      }


    console.log('\n=== RESULTADO FINAL ===');
    console.log(result.result);

    console.log(
      '\nStatus:',
      result.success ? 'SUCESSO' : 'FALHA'
    );

    console.log('\n=== MÉTRICAS ===');

    console.log(
      JSON.stringify(result.metrics, null, 2)
    );

    if (!result.success) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      'Erro fatal no agente:',
      error
    );

    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
