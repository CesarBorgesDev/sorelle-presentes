import { getSetting, setSetting } from './settings.js';

export const CONTENT_PAGES = {
  'sobre-nos': {
    settingKey: 'page_sobre_nos',
    title: 'Sobre Nós',
    defaultContent: `## Nossa história

A **Sorelle Presentes** nasceu do desejo de reunir, em um só lugar, presentes e peças de decoração selecionadas com carinho — para quem valoriza detalhes, qualidade e momentos especiais.

Somos uma loja de Sacramento, Minas Gerais, dedicada a transformar gestos simples em memórias duradouras. Cada produto passa por uma curadoria criteriosa, pensando no conforto do lar, na beleza dos ambientes e no prazer de presentear.

## O que nos move

- **Curadoria:** escolhemos peças que combinam estética, funcionalidade e propósito.
- **Atendimento próximo:** tratamos cada cliente com atenção e transparência.
- **Paixão pelo lar:** acreditamos que ambientes bem cuidados refletem quem somos.

## Onde estamos

Sacramento — MG  
Telefone: (34) 3351-1975  
E-mail: contato@sorellepresentes.com.br

Obrigado por fazer parte da nossa história.`,
  },
  'politica-de-privacidade': {
    settingKey: 'page_politica_privacidade',
    title: 'Política de Privacidade',
    defaultContent: `## Introdução

A **Sorelle Presentes** respeita a sua privacidade. Esta política descreve como coletamos, usamos e protegemos seus dados pessoais ao utilizar nosso site e serviços.

## Dados que coletamos

Podemos coletar:

- **Cadastro:** nome, e-mail, telefone e senha (armazenada de forma criptografada).
- **Compras:** endereço de entrega, CPF/CNPJ quando necessário, histórico de pedidos e forma de pagamento.
- **Navegação:** cookies e dados técnicos de acesso (IP, navegador, páginas visitadas) para melhorar a experiência.

## Como usamos seus dados

Utilizamos as informações para:

- Processar pedidos, entregas e pagamentos;
- Enviar confirmações e atualizações sobre compras;
- Prestar suporte ao cliente;
- Cumprir obrigações legais e fiscais;
- Melhorar nossos produtos e a experiência no site.

## Compartilhamento

Não vendemos seus dados. Podemos compartilhá-los apenas com:

- Operadores de pagamento e logística, para concluir sua compra;
- Autoridades, quando exigido por lei.

## Seus direitos

Você pode solicitar:

- Acesso, correção ou exclusão dos seus dados;
- Revogação de consentimentos, quando aplicável.

Entre em contato: **contato@sorellepresentes.com.br**

## Segurança

Adotamos medidas técnicas e organizacionais para proteger suas informações, incluindo conexões seguras e controle de acesso.

## Alterações

Esta política pode ser atualizada. A versão vigente estará sempre disponível nesta página.

**Última atualização:** ${new Date().toLocaleDateString('pt-BR')}`,
  },
  'termos-de-uso': {
    settingKey: 'page_termos_de_uso',
    title: 'Termos de Uso',
    defaultContent: `## Aceitação dos termos

Ao acessar e utilizar o site da **Sorelle Presentes**, você concorda com estes Termos de Uso. Se não concordar com qualquer condição, recomendamos não utilizar nossos serviços.

## Uso do site

O site destina-se à consulta de produtos, realização de compras e interação com nossos serviços de forma lícita. É proibido:

- Utilizar o site para fins fraudulentos ou ilegais;
- Tentar acessar áreas restritas sem autorização;
- Reproduzir conteúdo, imagens ou textos sem permissão;
- Interferir no funcionamento da plataforma.

## Cadastro e conta

Para comprar, você deve fornecer informações verdadeiras e mantê-las atualizadas. Você é responsável pela confidencialidade da sua senha e pelas atividades realizadas em sua conta.

## Produtos, preços e pagamento

- Os preços exibidos podem ser alterados sem aviso prévio, respeitando o valor confirmado no pedido;
- Imagens são ilustrativas; pequenas variações de cor ou acabamento podem ocorrer;
- O pagamento é processado conforme as formas disponíveis no checkout;
- Pedidos estão sujeitos à confirmação de estoque e aprovação do pagamento.

## Entrega

Os prazos de entrega são estimados e podem variar conforme região, transportadora e disponibilidade. O endereço informado no checkout é de responsabilidade do cliente.

## Propriedade intelectual

Todo o conteúdo do site (textos, marcas, logotipos, layout e imagens) pertence à Sorelle Presentes ou a seus licenciadores, sendo protegido pela legislação aplicável.

## Limitação de responsabilidade

Empregamos esforços para manter o site disponível e seguro, mas não garantimos operação ininterrupta. Não nos responsabilizamos por danos indiretos decorrentes do uso da plataforma, dentro dos limites permitidos por lei.

## Alterações

Estes termos podem ser atualizados a qualquer momento. A versão vigente estará sempre disponível nesta página.

## Contato

Dúvidas sobre estes termos: **contato@sorellepresentes.com.br** ou **(34) 3351-1975**.

**Última atualização:** ${new Date().toLocaleDateString('pt-BR')}`,
  },
  'trocas-e-devolucoes': {
    settingKey: 'page_trocas_devolucoes',
    title: 'Trocas e Devoluções',
    defaultContent: `## Direito de arrependimento

De acordo com o Código de Defesa do Consumidor, você pode desistir da compra em até **7 (sete) dias corridos** após o recebimento do produto, quando a compra for realizada fora do estabelecimento comercial (internet).

## Condições para troca ou devolução

O produto deve ser devolvido:

- Na embalagem original, sem indícios de uso;
- Com todos os acessórios, etiquetas e brindes (quando aplicável);
- Acompanhado da nota fiscal ou comprovante do pedido.

## Produtos elegíveis

Não aceitamos troca ou devolução de produtos:

- Personalizados ou sob encomenda;
- De higiene pessoal, após abertos ou utilizados;
- Com sinais de uso, avaria ou violação da embalagem por culpa do cliente.

Em caso de **defeito de fabricação** ou **produto divergente** do pedido, entre em contato imediatamente para orientação.

## Como solicitar

1. Envie e-mail para **contato@sorellepresentes.com.br** informando número do pedido, motivo e fotos (se houver avaria);
2. Aguarde nossa confirmação com instruções de envio ou coleta;
3. Após análise, procederemos com reembolso, crédito ou troca conforme o caso.

## Reembolso

O reembolso será processado na mesma forma de pagamento utilizada na compra, em prazo compatível com a operadora ou instituição financeira, após recebimento e conferência do produto.

## Frete de devolução

- **Arrependimento:** o custo do frete de devolução pode ser de responsabilidade do cliente, salvo disposição em contrário informada no atendimento;
- **Defeito ou erro nosso:** o frete de devolução será por conta da Sorelle Presentes.

## Trocas por tamanho ou cor

Quando houver disponibilidade em estoque, podemos realizar troca por outra variação do mesmo produto. Entre em contato em até 7 dias após o recebimento.

## Contato

**contato@sorellepresentes.com.br**  
**(34) 3351-1975**  
Sacramento — MG

**Última atualização:** ${new Date().toLocaleDateString('pt-BR')}`,
  },
};

function parseStoredPage(raw, fallback) {
  if (!raw) return { ...fallback };
  try {
    const parsed = JSON.parse(raw);
    return {
      slug: fallback.slug,
      title: parsed.title || fallback.title,
      content: parsed.content ?? fallback.content,
      updated_date: parsed.updated_date || null,
    };
  } catch {
    return { ...fallback, content: raw };
  }
}

export async function getContentPage(slug) {
  const meta = CONTENT_PAGES[slug];
  if (!meta) return null;

  const raw = await getSetting(meta.settingKey);
  const fallback = {
    slug,
    title: meta.title,
    content: meta.defaultContent,
    updated_date: null,
  };

  return parseStoredPage(raw, fallback);
}

export async function getAllContentPages() {
  const slugs = Object.keys(CONTENT_PAGES);
  const pages = await Promise.all(slugs.map((slug) => getContentPage(slug)));
  return pages.filter(Boolean);
}

export async function updateContentPage(slug, { title, content }) {
  const meta = CONTENT_PAGES[slug];
  if (!meta) return null;

  const payload = {
    title: (title || meta.title).trim(),
    content: content ?? meta.defaultContent,
    updated_date: new Date().toISOString(),
  };

  await setSetting(meta.settingKey, JSON.stringify(payload));
  return getContentPage(slug);
}

export function listContentPageDefinitions() {
  return Object.entries(CONTENT_PAGES).map(([slug, meta]) => ({
    slug,
    title: meta.title,
    settingKey: meta.settingKey,
  }));
}
