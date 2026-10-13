/**
 * Definição das ferramentas expostas ao modelo via tool use.
 * Cada tool corresponde a um método do BrowserController.
 */
export const tools = [
  {
    name: 'navigate',
    description: 'Navega o navegador para uma URL específica.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL completa, incluindo https://' },
      },
      required: ['url'],
    },
  },
  {
    name: 'click',
    description:
      'Clica em um elemento da página, referenciado pelo id numérico mostrado no estado atual da página.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'id do elemento (campo "id" na lista de elementos)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'type',
    description: 'Digita um texto em um campo de input/textarea, referenciado pelo id numérico.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        text: { type: 'string' },
      },
      required: ['id', 'text'],
    },
  },
  {
    name: 'press_key',
    description: 'Pressiona uma tecla do teclado, ex: "Enter", "Escape", "Tab".',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
      },
      required: ['key'],
    },
  },
  {
    name: 'scroll',
    description: 'Rola a página para cima ou para baixo para revelar mais conteúdo/elementos.',
    input_schema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'] },
      },
      required: ['direction'],
    },
  },
  {
    name: 'extract_text',
    description:
      'Extrai o texto visível de toda a página atual. Útil para ler resultados de busca, tabelas, artigos etc.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'finish',
    description:
      'Encerra a tarefa. Deve ser chamada assim que o objetivo tiver sido cumprido (ou identificado como impossível).',
    input_schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        result: { type: 'string', description: 'Resumo do resultado final para o usuário.' },
      },
      required: ['success', 'result'],
    },
  },
];
