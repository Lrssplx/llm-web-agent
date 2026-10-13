
export const scenarioCatalog = [
  {
    scenarioKey: 'LOGIN_VALID',
    title: 'Login com credenciais válidas',
    type: 'positive',
    priority: 'high',
    preconditions: [
      'Aplicação disponível',
      'Usuário de demonstração existente',
    ],
    steps: [
      'Preencher Username com standard_user',
      'Preencher Password com secret_sauce',
      'Clicar no botão Login',
      'Observar o resultado do login',
    ],
    expectedResult:
      'Usuário redirecionado para a página de produtos.',
    expectationSource: 'requirement',
    expectation: {
      type: 'url_contains',
      value: '/inventory.html',
    },
  },
  {
    scenarioKey: 'LOGIN_INVALID_PASSWORD',
    title: 'Login com senha incorreta',
    type: 'negative',
    priority: 'high',
    preconditions: [
      'Aplicação disponível',
    ],
    steps: [
      'Preencher Username com standard_user',
      'Preencher Password com senha_errada',
      'Clicar no botão Login',
      'Observar a mensagem de erro',
    ],
    expectedResult:
      'Acesso negado com mensagem de credenciais inválidas.',
    expectationSource: 'requirement',
    expectation: {
      type: 'text_visible',
      value:
        'Epic sadface: Username and password do not match any user in this service',
    },
  },
  {
    scenarioKey: 'LOGIN_INVALID_USER',
    title: 'Login com usuário inexistente',
    type: 'negative',
    priority: 'high',
    preconditions: [
      'Aplicação disponível',
    ],
    steps: [
      'Preencher Username com usuario_inexistente',
      'Preencher Password com secret_sauce',
      'Clicar no botão Login',
      'Observar a mensagem de erro',
    ],
    expectedResult:
      'Acesso negado com mensagem de credenciais inválidas.',
    expectationSource: 'requirement',
    expectation: {
      type: 'text_visible',
      value:
        'Epic sadface: Username and password do not match any user in this service',
    },
  },
  {
    scenarioKey: 'LOGIN_EMPTY_FIELDS',
    title: 'Login com campos vazios',
    type: 'negative',
    priority: 'high',
    preconditions: [
      'Campos inicialmente vazios',
    ],
    steps: [
      'Não preencher Username nem Password',
      'Clicar no botão Login',
      'Observar a validação apresentada',
    ],
    expectedResult:
      'A aplicação informa que Username é obrigatório.',
    expectationSource: 'requirement',
    expectation: {
      type: 'text_visible',
      value: 'Epic sadface: Username is required',
    },
  },
];

export function getCatalogScenarios(keys = []) {
  const selected = keys.length > 0
    ? keys
    : scenarioCatalog.map(s => s.scenarioKey);

  const unknown = selected.filter(
    key => !scenarioCatalog.some(
      scenario => scenario.scenarioKey === key
    )
  );

  if (unknown.length > 0) {
    throw new Error(
      `Cenários desconhecidos: ${unknown.join(', ')}`
    );
  }

  return selected.map((key, index) => {
    const scenario = scenarioCatalog.find(
      item => item.scenarioKey === key
    );

    return {
      ...scenario,
      id: `QA-${String(index + 1).padStart(3, '0')}`,
      status: 'NOT_EXECUTED',
    };
  });
}
