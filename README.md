# llm-web-agent

Agente que usa um LLM (Claude, via API da Anthropic) para automatizar tarefas
em páginas web, controlando um navegador real com **Playwright**.

## Por que Playwright em vez de Cypress?

Cypress roda dentro do próprio navegador via um test runner e foi desenhado
para **testes** escritos por humanos, com uma API síncrona pensada para
scripts fixos. Ele não foi feito para ser pilotado passo a passo por um
processo externo (o LLM) decidindo a próxima ação em tempo real.

Playwright roda o navegador via protocolo (CDP), como Node.js comum,
com API assíncrona, controle total sobre múltiplas páginas/abas, e é a base
da maioria dos agentes web open-source atuais (Browser Use, Anthropic
Computer Use, etc). Por isso é a escolha natural aqui.

## Arquitetura

```
┌─────────────────────┐        1. estado da página (URL, elementos)
│  BrowserController   │ ───────────────────────────────────────┐
│  (src/browser.js)    │                                         │
│  - Playwright wrapper │                                         ▼
│  - getState()         │                                ┌───────────────┐
│  - click / type /     │ <───── 2. ação escolhida ────── │   WebAgent     │
│    scroll / navigate  │        (tool_use do Claude)     │  (src/agent.js)│
└─────────────────────┘                                  │  loop de       │
                                                            │  percepção→   │
                                                            │  decisão→ação │
                                                            └───────┬───────┘
                                                                    │ 3. chama a API
                                                                    ▼
                                                          ┌──────────────────┐
                                                          │  Claude (LLM)     │
                                                          │  com tool use     │
                                                          │  (src/tools.js)   │
                                                          └──────────────────┘
```

**Loop do agente (ReAct-style):**

1. `BrowserController.getState()` escaneia o DOM e devolve uma lista enxuta
   de elementos interativos *visíveis* (links, botões, inputs...), cada um
   marcado com um `data-agent-id` numérico. Essa técnica ("set-of-marks")
   evita que o modelo precise inventar seletores CSS/XPath frágeis — ele só
   referencia elementos pelo número.
2. Esse estado é enviado ao Claude como texto, junto com a tarefa e o
   histórico da conversa.
3. Claude decide a próxima ação chamando uma **tool** (`navigate`, `click`,
   `type`, `scroll`, `press_key`, `extract_text` ou `finish`) definida em
   `src/tools.js`.
4. `WebAgent.executeTool()` traduz a chamada de tool para um método do
   `BrowserController`.
5. O novo estado da página é devolvido ao modelo como `tool_result`, e o
   loop repete até o modelo chamar `finish` ou o limite de passos
   (`MAX_STEPS`) ser atingido.

Esse padrão (perceber → decidir com LLM+tools → agir → repetir) é o mesmo
usado por agentes de navegação mais sofisticados; aqui está simplificado
para ser fácil de ler e estender.

## Instalação

```bash
npm install
npx playwright install chromium   # baixa o binário do Chromium
cp .env.example .env              # e edite com sua ANTHROPIC_API_KEY
```

## Uso

```bash
node src/index.js "Vá até https://news.ycombinator.com e me diga o título da primeira notícia"
```

Ou via npm script:

```bash
npm start -- "Pesquise 'playwright' no Google e resuma o primeiro resultado"
```

Para ver o navegador em ação (debug), defina `HEADLESS=false` no `.env`.

## Estrutura de arquivos

| Arquivo          | Responsabilidade                                          |
|-------------------|-------------------------------------------------------------|
| `src/browser.js`  | Percepção + ações no navegador (Playwright)                |
| `src/tools.js`    | Contrato de ferramentas exposto ao Claude (tool use)        |
| `src/agent.js`    | Loop agente: chama o LLM, executa a tool escolhida, repete  |
| `src/index.js`    | CLI: lê a tarefa da linha de comando e roda o agente        |

## Extensões possíveis

- **Screenshots como input visual**: `BrowserController.screenshot()` já
  existe; dá para enviar a imagem para o Claude junto do texto (ele aceita
  imagens) para tarefas que dependem de layout visual.
- **Múltiplas abas**: `context.newPage()` permite lidar com pop-ups/novas abas.
- **Guardrails de domínio**: validar `input.url` contra uma allowlist antes
  de `navigate`, para não deixar o agente sair do site alvo.
- **Limite de custo/tempo**: já existe `MAX_STEPS`; também dá para somar
  `usage.input_tokens`/`output_tokens` da resposta da API e abortar se
  passar de um orçamento.
- **Persistência de sessão**: usar `context.storageState()` para reaproveitar
  login/cookies entre execuções.
- **Cypress como alternativa**: viável apenas se a "pilotagem" acontecer via
  `cypress run` disparado programaticamente por task pré-gerada (não em
  loop interativo passo a passo), pois o Cypress não expõe uma API async
  para decisão em tempo real como o Playwright.

## Avisos

- O agente executa ações reais no navegador (cliques, envios de formulário
  etc.) de forma autônoma. Teste sempre primeiro com `HEADLESS=false` em
  sites de baixo risco.
- Evite usá-lo para logins, pagamentos ou ações irreversíveis sem revisão
  humana no meio do caminho.
# llm-web-agent
