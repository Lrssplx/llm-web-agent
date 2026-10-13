import Anthropic from '@anthropic-ai/sdk';
import { tools } from './tools.js';

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `Você é um agente autônomo que controla um navegador web real para cumprir tarefas do usuário.

Regras:
- A cada passo você recebe o estado atual da página: URL, título e uma lista de elementos
  interativos visíveis, cada um com um "id" numérico.
- Você só pode interagir com elementos usando o id mostrado (não invente seletores).
- Prefira ações pequenas e verificáveis: uma ação por vez, depois observe o novo estado.
- Se o elemento que você precisa não estiver visível, tente "scroll" antes de desistir.
- Se um campo de busca não tiver um botão óbvio, tente "press_key" com "Enter" depois de digitar.
- Use "extract_text" quando precisar ler o conteúdo da página (resultados, artigos, tabelas).
- Nunca invente informação: baseie suas respostas apenas no que foi observado na página.
- Assim que o objetivo da tarefa for cumprido, chame a ferramenta "finish" com um resumo do resultado.
- Se perceber que a tarefa é impossível de completar (ex: elemento nunca aparece, site bloqueia
  acesso), chame "finish" com success=false explicando o motivo.
- Não peça confirmação ao usuário: você deve agir de forma autônoma usando as ferramentas.`;

export class WebAgent {
  constructor({ browser, apiKey, maxSteps = 25, verbose = true, onStep = null }) {
    this.browser = browser;
    this.client = new Anthropic({ apiKey });
    this.maxSteps = maxSteps;
    this.verbose = verbose;
    this.onStep = onStep; // callback opcional(step, {action, input, state})
  }

  log(...args) {
    if (this.verbose) console.log(...args);
  }

  formatState(state) {
    const elementsText =
      state.elements
        .map(
          (e) =>
            `[${e.id}] <${e.tag}${e.type ? ' type=' + e.type : ''}${e.role ? ' role=' + e.role : ''}> "${e.text}"${
              e.href ? ' href=' + e.href : ''
            }`
        )
        .join('\n') || '(nenhum elemento interativo visível)';

    return `URL atual: ${state.url}\nTítulo: ${state.title}\n\nElementos interativos visíveis:\n${elementsText}`;
  }

  async run(task) {
    const initialState = await this.browser.getState();
    const messages = [
      {
        role: 'user',
        content: `Tarefa: ${task}\n\nEstado inicial do navegador:\n${this.formatState(initialState)}`,
      },
    ];

    for (let step = 0; step < this.maxSteps; step++) {
      this.log(`\n--- Passo ${step + 1}/${this.maxSteps} ---`);

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      const textBlock = response.content.find((b) => b.type === 'text');
      if (textBlock?.text) this.log('Raciocínio:', textBlock.text.slice(0, 300));

      const toolUse = response.content.find((b) => b.type === 'tool_use');

      if (!toolUse) {
        // O modelo respondeu só com texto: força a continuar agindo.
        messages.push({
          role: 'user',
          content:
            'Continue usando as ferramentas disponíveis para progredir na tarefa, ' +
            'ou chame "finish" se ela já foi concluída.',
        });
        continue;
      }

      this.log(`Ação: ${toolUse.name}`, JSON.stringify(toolUse.input));

      if (toolUse.name === 'finish') {
        this.log('Tarefa finalizada:', toolUse.input);
        return toolUse.input;
      }

      let toolResultText;
      let resultState = null;
      try {
        resultState = await this.executeTool(toolUse.name, toolUse.input);
        toolResultText =
          typeof resultState === 'string' ? resultState : this.formatState(resultState);
      } catch (err) {
        toolResultText = `Erro ao executar a ação "${toolUse.name}": ${err.message}`;
      }

      if (this.onStep) {
        await this.onStep(step + 1, { action: toolUse.name, input: toolUse.input, state: resultState });
      }

      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: toolResultText,
          },
        ],
      });
    }

    this.log('Número máximo de passos atingido sem finalizar.');
    return { success: false, result: 'Número máximo de passos atingido sem concluir a tarefa.' };
  }

  async executeTool(name, input) {
    switch (name) {
      case 'navigate':
        return this.browser.navigate(input.url);
      case 'click':
        return this.browser.click(input.id);
      case 'type':
        return this.browser.type(input.id, input.text);
      case 'press_key':
        return this.browser.pressKey(input.key);
      case 'scroll':
        return this.browser.scroll(input.direction);
      case 'extract_text':
        return this.browser.extractText();
      default:
        throw new Error(`Ferramenta desconhecida: ${name}`);
    }
  }
}
