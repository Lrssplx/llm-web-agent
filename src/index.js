import 'dotenv/config';
import { BrowserController } from './browser.js';
import { WebAgent } from './agent.js';

async function main() {
  const task = process.argv.slice(2).join(' ').trim();

  if (!task) {
    console.error('Uso: node src/index.js "descrição da tarefa em linguagem natural"');
    console.error('Exemplo: node src/index.js "Vá até example.com e me diga o título da página"');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Defina ANTHROPIC_API_KEY no arquivo .env (veja .env.example).');
    process.exit(1);
  }

  const headless = process.env.HEADLESS !== 'false';
  const maxSteps = Number(process.env.MAX_STEPS || 25);

  const browser = new BrowserController({ headless });
  await browser.launch();

  const agent = new WebAgent({
    browser,
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxSteps,
    verbose: true,
  });

  try {
    const result = await agent.run(task);
    console.log('\n=== Resultado final ===');
    console.log(result);
  } catch (err) {
    console.error('Erro fatal no agente:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
