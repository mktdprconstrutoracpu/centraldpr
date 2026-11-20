// ============================================================================
// O ROTEIRO DA "ANA, DA DPR" EM CODIGO (20/11/2026), sem IA paga.
//
// As 17 respostas aprovadas por ela em 20/11/2026 (jeito de falar e textos fixos
// da Ana do WhatsApp da Houzze), escolhidas por PALAVRAS-CHAVE e pelos botoes de
// assunto do chat. As respostas que dependem da casa (saldo, parcela, boleto,
// obra) sao montadas com os dados lidos agora do banco.
//
// Como achar o assunto: o texto vai para minusculas e sem acento; cada assunto
// tem palavras (podem ser o comeco de uma palavra: "atrasad" pega "atrasada");
// ganha o assunto com mais letras casadas. Nenhum casou: "nao entendi" + os
// botoes de assunto + "Falar com a equipe".
//
// Para mudar uma resposta: mude o texto aqui. Para ensinar uma palavra nova:
// acrescente em "palavras" do assunto. O "_" no nome faz a Vercel nao publicar
// este arquivo como endereco.
// ============================================================================

const ENCAMINHAR = 'Vou encaminhar sua dúvida à equipe da DPR, que entrará em contato com você.';
const JA_ENCAMINHADA = 'A equipe da DPR já recebeu sua dúvida e vai responder por aqui.';
const NAO_ENTENDI = 'Não entendi bem sua dúvida. Escolha um dos assuntos abaixo ou escreva de outro jeito. Se preferir, toque em Falar com a equipe.';

const INCC = 'Os valores pagos à construtora são atualizados pela variação positiva do INCC-DI, desde o período anterior ao início das obras até sua conclusão e emissão do Habite-se.\n\n'
  + 'O índice é calculado mensalmente pelo IBRE/FGV, com base na variação dos custos da construção civil, não sendo definido pelas construtoras. É uma atualização monetária prevista contratualmente.\n\n'
  + 'Para mais informações, consulte o site oficial da FGV:\n\nhttps://portal.fgv.br/noticias/incc-m-2026';
const CUSTAS = 'Além da entrada, é necessário considerar os custos de escritura, registro em cartório e ITBI. Esses valores não estão incluídos no financiamento e variam conforme o preço do imóvel.';
const ESCRITURA = 'A entrada reduz o valor a ser financiado, mas não altera o preço do imóvel. Após a formalização do financiamento com a Caixa, o contrato será registrado em seu nome. A escritura definitiva poderá ser realizada após a quitação total do financiamento.';

const reais = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dataBR = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesExtenso = (iso) => { const m = /^(\d{4})-(\d{2})/.exec(String(iso || '')); return m ? MESES[Number(m[2]) - 1] + ' de ' + m[1] : ''; };
const valorDe = (p) => reais(p.parcela_corrigida != null ? p.parcela_corrigida : p.parcela_construtora);
const nomeCasa = (c) => { const u = String(c.unidade || 'sua casa').toLowerCase(); return u.charAt(0).toUpperCase() + u.slice(1); };

// o resumo de cada casa: parcelas pagas, vencidas e a proxima
function situacao(c, hoje) {
  const ps = (c.parcelas || []).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  return {
    total: ps.length,
    pagas: ps.filter((p) => p.pago).length,
    vencidas: ps.filter((p) => !p.pago && p.data_vencimento && String(p.data_vencimento).slice(0, 10) < hoje),
    proxima: ps.find((p) => !p.pago && p.data_vencimento && String(p.data_vencimento).slice(0, 10) >= hoje) || null
  };
}
// varias casas: uma frase por casa, com o nome; uma casa so: a frase sem o nome
function porCasa(d, frase) {
  if (!d.casas.length) return null;
  if (d.casas.length === 1) return frase(d.casas[0], situacao(d.casas[0], d.hoje), '');
  return d.casas.map((c) => frase(c, situacao(c, d.hoje), nomeCasa(c) + ': ')).join('\n');
}
const SEM_CASA = 'Ainda não há uma casa liberada no seu acesso, então não consigo ver esses dados. Se quiser, toque em Falar com a equipe.';

function obraTexto(d) {
  if (!d.obra) return null;
  const ets = (d.obra.etapas || []).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const atual = ets.find((e) => e.situacao === 'em_andamento') || ets.find((e) => e.situacao === 'a_fazer');
  const partes = [];
  if (atual) partes.push('A etapa atual é ' + atual.nome + '.');
  else if (ets.length) partes.push('Todas as etapas cadastradas estão concluídas.');
  if (d.obra.ultima && d.obra.ultima.percentual != null) partes.push('O andamento aprovado está em ' + d.obra.ultima.percentual + '%.');
  if (d.obra.ultima && d.obra.ultima.data_referencia) partes.push('A última atualização com fotos é de ' + mesExtenso(d.obra.ultima.data_referencia) + '.');
  return partes.length ? partes.join(' ') : null;
}

// ---- os assuntos (a ordem desempata: o de cima ganha)
const ASSUNTOS = [
  {
    id: 'saudacao', botao: null, curta: true,
    palavras: ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'tudo bem'],
    resposta: () => ({ texto: 'Olá! Eu sou a Ana, assistente da DPR. Escolha um assunto abaixo ou escreva sua dúvida.' })
  },
  {
    id: 'obrigado', botao: null, curta: true,
    palavras: ['obrigad', 'agradec', 'valeu', 'grato', 'grata', 'show', 'ok', 'certo', 'entendi'],
    resposta: () => ({ texto: 'Por nada. Se precisar de mais alguma coisa, é só escrever aqui.' })
  },
  {
    id: 'robo', botao: null,
    palavras: ['robo', 'chatbot', 'inteligencia artificial', 'voce e uma pessoa', 'voce e humano', 'e uma pessoa', 'e humana'],
    resposta: () => ({ texto: 'Sou a assistente virtual da DPR. O que eu não souber responder, a equipe da DPR responde por aqui. Se quiser falar com a equipe, toque em Falar com a equipe.' })
  },
  {
    id: 'pagamento', botao: null, encaminha: true,
    palavras: ['nao baixou', 'nao compensou', 'nao caiu', 'paguei', 'ja paguei', 'atrasad', 'atraso', 'renegoci', 'negociar', 'multa', 'juros', 'acordo', 'comprovante', 'cobranca errada', 'cobrado errado'],
    resposta: () => ({ texto: ENCAMINHAR, encaminhar: true })
  },
  {
    id: 'antecipar', botao: null, encaminha: true,
    palavras: ['antecip', 'antecipar parcela', 'antecipar as parcelas', 'quitar a casa', 'quitar', 'quitacao', 'adiantar', 'pagar tudo', 'pagar de uma vez', 'desconto', 'amortiz'],
    resposta: () => ({ texto: 'Dá para conversar com o financeiro sobre isso. ' + ENCAMINHAR, encaminhar: true })
  },
  {
    id: 'saldo', botao: 'Saldo devedor',
    palavras: ['saldo', 'saldo devedor', 'quanto falta', 'falta pagar', 'quanto devo', 'quanto eu devo', 'devendo', 'divida', 'parcelas pagas', 'quantas parcelas', 'extrato'],
    resposta: (d) => {
      const t = porCasa(d, (c, s, n) => n + 'Seu saldo devedor é ' + (reais(c.saldo_devedor_atual) || 'um valor ainda não informado') + '. Você já pagou ' + s.pagas + ' de ' + s.total + ' parcelas.');
      return { texto: t ? t + '\nO detalhe de cada parcela está em Meu extrato.' : SEM_CASA };
    }
  },
  {
    id: 'parcela', botao: 'Próxima parcela',
    palavras: ['proxima parcela', 'parcela', 'vence', 'vencimento', 'vencer', 'valor da parcela', 'mensalidade', 'prestacao', 'quando pago'],
    resposta: (d) => {
      let vencidas = 0;
      const t = porCasa(d, (c, s, n) => {
        vencidas += s.vencidas.length;
        return n + (s.proxima ? 'A próxima parcela vence em ' + dataBR(s.proxima.data_vencimento) + ', no valor de ' + (valorDe(s.proxima) || 'valor ainda não informado') + '.' : 'Não há parcela a vencer em aberto.');
      });
      if (!t) return { texto: SEM_CASA };
      const aviso = vencidas ? '\nConsta também ' + (vencidas === 1 ? 'uma parcela vencida' : vencidas + ' parcelas vencidas') + ' em aberto. Se quiser, toque em Falar com a equipe que o financeiro ajuda você.' : '';
      return { texto: t + aviso };
    }
  },
  {
    id: 'boleto', botao: 'Boleto',
    palavras: ['boleto', 'boleto da parcela', 'boleto do mes', 'meu boleto', 'segunda via', '2 via', '2a via', 'codigo de barras', 'linha digitavel', 'pix', 'como pago', 'como pagar', 'onde pago', 'pagar a parcela'],
    resposta: (d) => {
      const t = porCasa(d, (c, s, n) => {
        if (!s.proxima) return n + 'Não há parcela a vencer em aberto, então não há boleto pendente.';
        if (s.proxima.boleto_caminho) return n + 'O boleto da parcela de ' + dataBR(s.proxima.data_vencimento) + ' está no botão Boleto da parcela, em Meu extrato. Ele também chega pelo WhatsApp quando é anexado.';
        return n + 'O boleto da parcela de ' + dataBR(s.proxima.data_vencimento) + ' ainda não foi disponibilizado. Assim que o financeiro anexar, ele aparece em Meu extrato e chega pelo WhatsApp.';
      });
      return { texto: t || SEM_CASA };
    }
  },
  {
    id: 'incc', botao: 'INCC',
    palavras: ['incc', 'correcao', 'corrigid', 'reajuste', 'reajust', 'indice', 'valor mudou', 'valor aumentou', 'aumentou', 'por que o valor', 'atualizacao monetaria'],
    resposta: () => ({ texto: INCC })
  },
  {
    id: 'entrega', botao: 'Entrega',
    palavras: ['entrega', 'entregue', 'fica pronta', 'ficar pronta', 'pronta', 'prazo', 'quando termina', 'previsao', 'quando vou morar', 'mudar para a casa'],
    resposta: (d) => {
      const o = obraTexto(d);
      return { texto: 'A previsão de entrega é de aproximadamente 12 meses, contados a partir do início da obra.' + (o ? ' ' + o + ' Você acompanha em Evolução da obra.' : '') };
    }
  },
  {
    id: 'obra', botao: 'Obra',
    palavras: ['obra', 'andamento', 'foto', 'evolucao', 'comecou', 'comecar', 'etapa', 'construcao', 'construindo', 'como esta a casa'],
    resposta: (d) => {
      const o = obraTexto(d);
      return { texto: o ? o + ' Veja as fotos e o detalhe em Evolução da obra.' : 'As atualizações da obra aparecem em Evolução da obra assim que a equipe publica.' };
    }
  },
  {
    id: 'financiamento', botao: 'Financiamento',
    palavras: ['financiamento', 'financiar', 'financiad', 'caixa', 'banco', 'minha casa minha vida', 'mcmv', 'faixa 2', 'parcela do banco', 'credito'],
    resposta: () => ({ texto: 'O financiamento é realizado pela Caixa Econômica Federal, por meio do programa Minha Casa, Minha Vida (Faixa 2).\n'
      + 'Primeiro você assina o contrato com a construtora e paga a entrada. Depois, a Caixa realiza a análise de crédito e com a aprovação, formaliza o financiamento. As parcelas do financiamento começam a ser cobradas somente após a entrega da obra.' })
  },
  {
    id: 'fgts', botao: null, encaminha: true,
    palavras: ['fgts', 'fundo de garantia'],
    resposta: () => ({ texto: 'O uso do FGTS depende do seu caso. ' + ENCAMINHAR, encaminhar: true })
  },
  {
    id: 'documentos', botao: 'Documentos',
    palavras: ['documento', 'documentacao', 'compor renda', 'composicao de renda', 'renda', 'holerite', 'analise de credito', 'aprovacao da caixa', 'papelada'],
    resposta: () => ({ texto: 'Você pode compor renda com seus pais, irmãos, avós ou cônjuge. Basta incluí-los na proposta e apresentar a documentação de todos para análise da Caixa.\n'
      + 'Os documentos da análise são: CNH ou RG; comprovante de residência; declaração de imposto de renda; certidão de nascimento ou casamento; comprovante de renda formal (holerite); extrato bancário dos últimos 6 meses.' })
  },
  {
    id: 'custas', botao: null,
    palavras: ['itbi', 'cartorio', 'registro', 'custas', 'custo', 'taxa', 'imposto'],
    resposta: () => ({ texto: CUSTAS })
  },
  {
    id: 'escritura', botao: 'Escritura',
    palavras: ['escritura', 'no meu nome', 'meu nome', 'titulo', 'propriedade', 'dono'],
    resposta: () => ({ texto: ESCRITURA + '\n' + CUSTAS })
  },
  {
    id: 'casa', botao: null, encaminha: true,
    palavras: ['personaliz', 'mudar a planta', 'mudanca na casa', 'alterar a casa', 'reforma', 'vistoria', 'chave', 'assistencia', 'defeito', 'problema na casa', 'garantia', 'acabamento', 'infiltra', 'rachadura', 'vazamento'],
    resposta: () => ({ texto: ENCAMINHAR, encaminhar: true })
  },
  {
    id: 'acesso', botao: 'Meu acesso',
    palavras: ['e mail', 'email', 'acesso', 'login', 'senha', 'entrar na central', 'como entro', 'cpf', 'trocar meu'],
    resposta: () => ({ texto: 'O acesso à Central é com o e-mail e o CPF cadastrados. Para trocar o e-mail, use Meu e-mail, no menu: a DPR confere e aprova, e depois o acesso passa a ser com o e-mail novo e o mesmo CPF.' })
  },
  {
    id: 'planta', botao: 'Projeto',
    palavras: ['planta', 'projeto', '3d', 'imagem', 'imagens', 'fachada', 'metragem', 'tamanho da casa', 'quantos quartos', 'metros'],
    resposta: () => ({ texto: 'As imagens do projeto estão em Projeto 3D. Se precisar da planta interna detalhada da sua casa, toque em Falar com a equipe.' })
  },
  {
    id: 'endereco', botao: 'Endereço',
    palavras: ['endereco', 'onde fica', 'localizacao', 'localiza', 'regiao', 'bairro', 'cep', 'mercado', 'farmacia', 'escola', 'ubs', 'posto de saude', 'hospital', 'padaria', 'banco perto', 'perto', 'comercio'],
    resposta: () => ({ texto: 'O Villagio Caucaia II fica na Estrada Capelinha, 112, Caucaia do Alto, Cotia, CEP 06729-080.\n'
      + 'Perto dele estão a UBS e Pronto Atendimento Caucaia do Alto (Av. Roque Celestino Pires, 1020), o mercado Barbosa (Av. Roque Celestino Pires, 1071) e a farmácia Caufarma (Av. Inocêncio Pires de Oliveira, 29). O centro de Cotia fica a uns 17 km, pela Raposo Tavares.' })
  },
  {
    id: 'equipe', botao: null, encaminha: true,
    palavras: ['distrato', 'cancelar', 'cancelamento', 'desistir', 'desistencia', 'reclama', 'reclamacao', 'falar com', 'atendente', 'humano', 'alguem da dpr', 'gerente', 'corretor', 'me liga', 'ligar', 'telefone', 'whatsapp', 'contato', 'procon', 'advogado', 'processo'],
    resposta: () => ({ texto: ENCAMINHAR, encaminhar: true })
  }
];

// os botoes de assunto do chat (o texto do botao e enviado como mensagem e cai no assunto dele)
const BOTOES = ASSUNTOS.filter((a) => a.botao).map((a) => a.botao);

function normalizar(t) {
  return ' ' + String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
}

// acha o assunto: o de mais letras casadas; a palavra tem que comecar no comeco de uma palavra do texto.
// "curta" (oi, obrigado): so vale se a mensagem for curta e nada mais casar.
function acharAssunto(mensagem) {
  const t = normalizar(mensagem);
  let melhor = null, pontos = 0, curta = null;
  ASSUNTOS.forEach((a) => {
    // o texto exato de um botao vale como acerto certeiro
    let p = a.botao && normalizar(a.botao) === t ? 1000 : 0;
    a.palavras.forEach((w) => { const k = normalizar(w).trim(); if (k && t.indexOf(' ' + k) >= 0) p += k.length; });
    if (!p) return;
    if (a.curta) { if (!curta) curta = a; return; }
    if (p > pontos) { melhor = a; pontos = p; }
  });
  if (melhor) return melhor;
  if (curta && t.trim().split(' ').length <= 6) return curta;
  return null;
}

// a resposta para a mensagem; jaAguardando = a conversa ja esta com a equipe (nao encaminha de novo)
//   -> { texto, encaminhar, opcoes, assunto }
function responderRoteiro(mensagem, dados, jaAguardando) {
  const a = acharAssunto(mensagem);
  if (!a) return { texto: NAO_ENTENDI, encaminhar: false, opcoes: true, assunto: null };
  const r = a.resposta(dados);
  if (r.encaminhar && jaAguardando) return { texto: JA_ENCAMINHADA, encaminhar: false, opcoes: false, assunto: a.id };
  return { texto: r.texto, encaminhar: !!r.encaminhar, opcoes: a.id === 'saudacao', assunto: a.id };
}

module.exports = { responderRoteiro, acharAssunto, BOTOES, ENCAMINHAR, JA_ENCAMINHADA, NAO_ENTENDI, INCC };
