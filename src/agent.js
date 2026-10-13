
import Anthropic from '@anthropic-ai/sdk';
import { tools } from './tools.js';

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `
Você é um agente autônomo que controla um navegador web real
para cumprir tarefas do usuário.

Regras:
- A cada passo você recebe o estado atual da página: URL,
  título e uma lista de elementos interativos visíveis,
  cada um com um "id" numérico.
- Você só pode interagir com elementos usando o id mostrado.
  Não invente seletores.
- Prefira ações pequenas e verificáveis: uma ação por vez,
  depois observe o novo estado.
- Se o elemento desejado não estiver visível,
  tente usar scroll antes de desistir.
- Se um campo de busca não tiver botão,
  tente press_key com Enter.
- Use extract_text quando precisar ler o conteúdo.
- Nunca invente informações ou resultados.
- Baseie suas conclusões apenas no que foi observado.
- Assim que cumprir o objetivo, chame finish.
- Se a tarefa não puder ser concluída,
  chame finish com success=false.
- Não solicite confirmação ao usuário.
- Não execute ações destrutivas, financeiras ou que alterem
  dados importantes sem autorização explícita.
`;

export class WebAgent {
  constructor({
    browser,
    apiKey,
    maxSteps = 25,
    maxDurationMs = 120000,
    verbose = true,
    onStep = null,
  }) {
    this.browser = browser;

    this.client = new Anthropic({
      apiKey,
      timeout: 30000,
      maxRetries: 1,
    });

    this.maxSteps = maxSteps;
    this.maxDurationMs = maxDurationMs;
    this.verbose = verbose;
    this.onStep = onStep;

    this.resetMetrics();
  }

  resetMetrics() {
    this.metrics = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalSteps: 0,
      durationMs: 0,
      actions: [],
    };
  }

  log(...args) {
    if (this.verbose) {
      console.log(...args);
    }
  }

  formatState(state) {
    if (!state || !Array.isArray(state.elements)) {
      return String(state ?? 'Estado indisponível');
    }

    const elementsText =
      state.elements
        .map((element) => {
          const type = element.type
            ? ` type=${element.type}`
            : '';

          const role = element.role
            ? ` role=${element.role}`
            : '';

          const href = element.href
            ? ` href=${element.href}`
            : '';

          return (
            `[${element.id}] ` +
            `<${element.tag}${type}${role}> ` +
            `"${element.text}"${href}`
          );
        })
        .join('\n') ||
      '(nenhum elemento interativo visível)';

    return `
URL atual: ${state.url}
Título: ${state.title}

Elementos interativos visíveis:
${elementsText}
`;
  }

  updateTokenMetrics(usage = {}) {
    this.metrics.inputTokens += usage.input_tokens ?? 0;
    this.metrics.outputTokens += usage.output_tokens ?? 0;

    this.metrics.cacheCreationTokens +=
      usage.cache_creation_input_tokens ?? 0;

    this.metrics.cacheReadTokens +=
      usage.cache_read_input_tokens ?? 0;
  }

  async run(task) {
    this.resetMetrics();

    const startedAt = Date.now();

    const finishRun = (result) => {
      this.metrics.durationMs = Date.now() - startedAt;

      return {
        ...result,
        metrics: {
          ...this.metrics,
          actions: [...this.metrics.actions],
        },
      };
    };

    const initialState = await this.browser.getState();

    const messages = [
      {
        role: 'user',
        content: `
Tarefa: ${task}

Estado inicial do navegador:
${this.formatState(initialState)}
`,
      },
    ];

    for (let step = 0; step < this.maxSteps; step++) {
      if (Date.now() - startedAt >= this.maxDurationMs) {
        return finishRun({
          success: false,
          result: 'Tempo máximo de execução atingido.',
        });
      }

      this.log(
        `\n--- Passo ${step + 1}/${this.maxSteps} ---`
      );

      let response;

      try {
        response = await this.client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools,
          tool_choice: {
            type: 'auto',
            disable_parallel_tool_use: true,
          },
          messages,
        });
      } catch (error) {
        return finishRun({
          success: false,
          result: `Erro na comunicação com Claude: ${error.message}`,
        });
      }

      this.updateTokenMetrics(response.usage);
      this.metrics.totalSteps = step + 1;

      messages.push({
        role: 'assistant',
        content: response.content,
      });

      const textBlock = response.content.find(
        (block) => block.type === 'text'
      );

      if (textBlock?.text) {
        this.log(
          'Mensagem do Claude:',
          textBlock.text.slice(0, 300)
        );
      }

      const toolUses = response.content.filter(
        (block) => block.type === 'tool_use'
      );

      if (toolUses.length === 0) {
        messages.push({
          role: 'user',
          content:
            'Continue usando as ferramentas disponíveis ' +
            'ou chame finish para encerrar a tarefa.',
        });

        continue;
      }

      // Proteção adicional para respostas inesperadas.
      // Cada tool_use precisa receber seu próprio tool_result.
      const toolResults = [];
      let finishInput = null;

      for (const toolUse of toolUses) {
        const { name, input, id } = toolUse;

        this.log(`Ação: ${name}`);

        if (name === 'finish') {
          finishInput = input;

          toolResults.push({
            type: 'tool_result',
            tool_use_id: id,
            content: 'Finalização registrada.',
          });

          continue;
        }

        let toolResultText;
        let resultState = null;
        let actionSuccess = false;

        const actionStart = Date.now();

        try {
          if (
            Date.now() - startedAt >= this.maxDurationMs
          ) {
            throw new Error(
              'Limite de tempo atingido.'
            );
          }

          resultState = await this.executeTool(
            name,
            input
          );

          toolResultText =
            typeof resultState === 'string'
              ? resultState
              : this.formatState(resultState);

          actionSuccess = true;
        } catch (error) {
          toolResultText =
            `Erro ao executar "${name}": ${error.message}`;

          this.log(toolResultText);
        }

        const actionDuration = Date.now() - actionStart;

        this.metrics.actions.push({
          step: step + 1,
          tool: name,
          success: actionSuccess,
          durationMs: actionDuration,
          url: this.browser.page?.url() ?? null,
        });

        if (this.onStep) {
          try {
            await this.onStep(step + 1, {
              action: name,
              input,
              state: resultState,
              success: actionSuccess,
              durationMs: actionDuration,
            });
          } catch (error) {
            this.log(
              'Erro no callback onStep:',
              error.message
            );
          }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: id,
          content: toolResultText,
          is_error: !actionSuccess,
        });
      }

      if (finishInput !== null) {
        this.log('Tarefa finalizada:', finishInput);

        return finishRun({
          success: finishInput.success === true,
          result: finishInput.result ?? '',
        });
      }

      messages.push({
        role: 'user',
        content: toolResults,
      });
    }

    this.log(
      'Número máximo de passos atingido sem finalizar.'
    );

    return finishRun({
      success: false,
      result:
        'Número máximo de passos atingido sem concluir a tarefa.',
    });
  }

  async executeTool(name, input) {
    switch (name) {
      case 'navigate':
        return this.browser.navigate(input.url);

      case 'click':
        return this.browser.click(input.id);

      case 'type':
        return this.browser.type(
          input.id,
          input.text
        );

      case 'press_key':
        return this.browser.pressKey(input.key);

      case 'scroll':
        return this.browser.scroll(input.direction);

      case 'extract_text':
        return this.browser.extractText();

      default:
        throw new Error(
          `Ferramenta desconhecida: ${name}`
        );
    }
  }
}
