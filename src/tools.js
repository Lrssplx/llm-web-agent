
export const tools = [
  {
    name: 'navigate',
    description:
      'Navega o navegador para uma URL específica.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'URL completa, incluindo https://',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'click',
    description:
      'Clica em um elemento identificado pelo id numérico mostrado no estado atual.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'integer',
          description: 'ID do elemento.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'type',
    description:
      'Digita texto em um campo identificado pelo id numérico.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'integer',
        },
        text: {
          type: 'string',
        },
      },
      required: ['id', 'text'],
    },
  },
  {
    name: 'press_key',
    description:
      'Pressiona uma tecla, como Enter, Escape ou Tab.',
    input_schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'scroll',
    description:
      'Rola a página para cima ou para baixo.',
    input_schema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['up', 'down'],
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'extract_text',
    description:
      'Extrai o texto visível da página atual.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'finish',
    description:
      'Encerra a tarefa quando concluída ou impossível.',
    input_schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
        },
        result: {
          type: 'string',
          description:
            'Resumo final do resultado para o usuário.',
        },
      },
      required: ['success', 'result'],
    },
  },
];
