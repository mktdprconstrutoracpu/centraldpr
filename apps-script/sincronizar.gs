/**
 * ============================================================================
 * SINCRONIZA A PLANILHA COM A CENTRAL DO CLIENTE.
 *
 * Este arquivo mora no repositório só para ficar versionado. Ele roda DENTRO
 * da planilha: Extensões > Apps Script > colar aqui.
 *
 * COMO CONFIGURAR (uma vez):
 *   Apps Script > Configurações do projeto > Propriedades do script > Adicionar
 *     CENTRAL_URL   https://<endereço da Central>/api/sincronizar
 *     SYNC_SECRET   a mesma senha configurada na Vercel
 *
 *   ⚠️ NÃO escreva a senha aqui no código. Quem abre a planilha abre o script.
 *
 * COMO RODAR:
 *   Selecione a função `sincronizarTudo` e clique em Executar.
 *   Se a planilha for grande, ela para sozinha antes do limite de tempo do
 *   Google e avisa. É só executar de novo: ela CONTINUA de onde parou.
 *   Para recomeçar do zero, execute `recomecarDoZero`.
 * ============================================================================
 */

// O Google mata a execução em 6 minutos. Paramos aos 4,5 para dar tempo de
// salvar o progresso e escrever o relatório — morrer no meio sem salvar faria
// a próxima execução repetir tudo.
var LIMITE_MS = 4.5 * 60 * 1000;

function sincronizarTudo() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('CENTRAL_URL');
  var segredo = props.getProperty('SYNC_SECRET');
  if (!url || !segredo) {
    throw new Error('Faltam CENTRAL_URL e/ou SYNC_SECRET nas Propriedades do script.');
  }

  var inicio = Date.now();
  var abas = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  var comecarEm = Number(props.getProperty('PROGRESSO') || 0);

  // Lido UMA vez, antes do laço: é a fonte do saldo devedor para todas as casas.
  var saldos = lerResumo(abas);
  var quantosSaldos = 0;
  for (var chave in saldos) { if (saldos.hasOwnProperty(chave)) quantosSaldos++; }
  Logger.log('RESUMO: ' + quantosSaldos + ' casas com saldo devedor.');

  var enviadas = 0;
  var puladas = 0;
  var falhas = [];
  // ⚠️ Casa sem comprador NÃO é falha: é casa que ainda não foi vendida (na
  // Caucaia II são as 6 marcadas como DISPONÍVEL/Permutante no RESUMO).
  // Misturar as duas coisas no mesmo número faz o relatório gritar "7 falhas"
  // quando o problema de verdade é UM — e um relatório que grita demais é um
  // relatório que ninguém lê.
  var semComprador = [];
  // Casa gravada, mas com célula que o banco não aceitou (data que não existe,
  // por exemplo). Precisa aparecer: "gravou" não é sinônimo de "está certo".
  var avisos = [];

  for (var i = comecarEm; i < abas.length; i++) {
    if (Date.now() - inicio > LIMITE_MS) {
      props.setProperty('PROGRESSO', String(i));
      Logger.log('PAUSADO na aba ' + (i + 1) + ' de ' + abas.length + '. Execute de novo para continuar.');
      relatorio(enviadas, puladas, falhas, semComprador, avisos, 'PAUSADO — execute de novo');
      return;
    }

    var aba = abas[i];
    var casa = lerAba(aba, saldos);
    if (!casa) { puladas++; continue; }

    // Casa sem saldo precisa aparecer: é o número que o cliente mais procura, e
    // um extrato sem ele fica pela metade sem ninguém perceber.
    if (casa.comprador && (casa.saldo_devedor_atual === null || casa.saldo_devedor_atual === undefined)) {
      avisos.push(aba.getName() + ' -> SEM saldo devedor (nao achei no RESUMO nem no rodape da aba)');
    }

    if (casa._ignoradas) {
      avisos.push(aba.getName() + ' -> ' + casa._ignoradas + ' linha(s) sem data ignorada(s) (cabecalho repetido, subtotal ou anotacao no meio da tabela)');
    }

    var r = enviar(url, segredo, casa);
    if (r.ok) {
      enviadas++;
      for (var a = 0; a < (r.avisos || []).length; a++) {
        avisos.push(aba.getName() + ' -> ' + r.avisos[a]);
      }
    } else if (r.erro.indexOf('comprador_vazio') >= 0) semComprador.push(aba.getName());
    else falhas.push(aba.getName() + ': ' + r.erro);
  }

  props.deleteProperty('PROGRESSO');
  relatorio(enviadas, puladas, falhas, semComprador, avisos, 'CONCLUIDO');
}

function recomecarDoZero() {
  PropertiesService.getScriptProperties().deleteProperty('PROGRESSO');
  Logger.log('Progresso zerado. Execute sincronizarTudo.');
}

function relatorio(enviadas, puladas, falhas, semComprador, avisos, situacao) {
  Logger.log('--- ' + situacao + ' ---');
  Logger.log('casas gravadas: ' + enviadas);
  Logger.log('abas ignoradas (sem tabela de parcelas): ' + puladas);
  Logger.log('casas SEM COMPRADOR (nao vendidas, nao entram): ' + semComprador.length);
  for (var s = 0; s < semComprador.length; s++) Logger.log('    ' + semComprador[s]);
  Logger.log('AVISOS (gravou, mas tem celula para corrigir na planilha): ' + avisos.length);
  for (var v = 0; v < avisos.length; v++) Logger.log('    ' + avisos[v]);
  Logger.log('FALHAS DE VERDADE: ' + falhas.length);
  for (var i = 0; i < falhas.length; i++) Logger.log('    ' + falhas[i]);
}

function enviar(url, segredo, casa) {
  try {
    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-sync-secret': segredo },
      payload: JSON.stringify(casa),
      muteHttpExceptions: true
    });
    var codigo = resp.getResponseCode();
    if (codigo >= 200 && codigo < 300) {
      // A casa foi gravada, mas pode ter vindo com aviso — célula que o banco
      // não aceitou e entrou vazia. Gravou não é sinônimo de "está tudo certo".
      var avisos = [];
      try { avisos = (JSON.parse(resp.getContentText()) || {}).avisos || []; } catch (e) { /* sem corpo: segue */ }
      return { ok: true, avisos: avisos };
    }
    return { ok: false, erro: 'HTTP ' + codigo + ' ' + resp.getContentText().slice(0, 200) };
  } catch (e) {
    return { ok: false, erro: String(e).slice(0, 200) };
  }
}

// ---------------------------------------------------------------------------
// LEITURA DE UMA ABA
// ---------------------------------------------------------------------------

// Sem acento, maiúscula, espaço simples — para comparar cabeçalho sem depender
// de como foi digitado.
// Faixa dos acentos combinantes, montada por codigo de caractere de proposito:
// escrever os caracteres literais aqui vira lixo se o arquivo mudar de
// codificacao, e o defeito seria SILENCIOSO (para de tirar acento, o cabecalho
// 'COMISSAO' nao casa mais com 'COMISSAO' e a coluna some do extrato).
var RE_ACENTOS = new RegExp('[' + String.fromCharCode(768) + '-' + String.fromCharCode(879) + ']', 'g');

function norm(v) {
  return String(v === null || v === undefined ? '' : v)
    .normalize('NFD').replace(RE_ACENTOS, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

// ⚠️ As colunas são achadas pelo NOME do cabeçalho, nunca pela posição. Se um
// dia inserirem uma coluna no meio da planilha, isto continua funcionando.
// A ordem dos testes importa: "IGPM PARCELA CONSTRUTORA" contém "PARCELA
// CONSTRUTORA", então o mais específico vem primeiro.
function campoDoCabecalho(h) {
  var t = norm(h);
  if (!t) return null;
  if (t.indexOf('SALDO DEVEDOR') === 0) return 'saldo_devedor';
  if (t.indexOf('STATUS DA PARCELA') === 0) return 'status_texto';
  if (t.indexOf('AMORTIZACAO') === 0) return 'amortizacao';
  if (t.indexOf('IGPM') === 0) return 'igpm_valor';
  if (t.indexOf('PARCELA CORRIGIDA') === 0) return 'parcela_corrigida';
  if (t.indexOf('PARCELAS CONSTRUTORA') === 0 || t.indexOf('PARCELA CONSTRUTORA') === 0) return 'parcela_construtora';
  if (t.indexOf('SALDO CORRIGIDO') === 0) return 'saldo_corrigido';
  if (t.indexOf('SALDO DA CONSTRUTORA') === 0) return 'saldo_construtora';
  if (t.indexOf('INCC') === 0) return t.indexOf('MES') >= 0 ? 'incc_valor' : 'incc_percentual';
  if (t.indexOf('COMISSAO') === 0) return 'comissao';
  if (t.indexOf('TIPO DE PARCELA') === 0) return 'tipo_parcela';
  if (t.indexOf('VALOR VENDA') === 0) return 'valor_venda';
  if (t === 'DATA') return 'data_vencimento';
  return null;
}

// Data como texto AAAA-MM-DD. Usa o fuso da planilha de propósito: converter
// pelo padrão do JavaScript joga a data um dia para trás em parte do ano.
function dataTexto(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v || '').trim();
  return s || null;
}

// A célula TEM CARA de data? Não valida se a data existe (30/02 passa aqui e é
// barrado depois, com aviso) — só separa "linha de parcela" de "linha que não é
// parcela".
//
// ⚠️ POR QUE ISTO EXISTE (execução real de 26/08): várias abas repetem o
// CABEÇALHO no meio da planilha. Sem esta checagem, a linha do cabeçalho virava
// uma parcela: a coluna DATA continha o texto "DEVEDOR ATUALIZADO" (sobra de
// "SALDO DEVEDOR ATUALIZADO"), e ela entrava no banco como parcela sem data,
// carregando valores que não são de ninguém — no extrato do cliente, uma linha
// fantasma no meio do carnê.
function pareceData(v) {
  if (v instanceof Date) return true;
  var s = String(v || '').trim();
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s);
}

// A célula carrega um VALOR em dinheiro? Serve para achar o saldo do rodapé sem
// depender da posição da coluna.
// Zero NÃO conta: a linha de rodapé costuma ter células zeradas antes do valor,
// e a primeira delas seria pega no lugar do saldo.
function pareceNumero(v) {
  if (typeof v === 'number') return isFinite(v) && v !== 0;
  var s = String(v === null || v === undefined ? '' : v)
    .replace(/[R$\s%]/gi, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  if (!s || s === '-') return false;
  var n = Number(s);
  return isFinite(n) && n !== 0;
}

// Pega o que vem depois dos dois-pontos: "COMPRADOR: FULANO" -> "FULANO".
function depoisDoRotulo(texto) {
  var s = String(texto || '');
  var i = s.indexOf(':');
  return (i === -1 ? s : s.slice(i + 1)).trim();
}

// O status do contrato está no NOME DA ABA: "CASA 05 (Distrato)".
// ⚠️ "realizado" é testado ANTES de "distrato" sozinho — senão
// "Distrato realizado" cairia no genérico e perderia a informação.
function statusDaAba(nome) {
  var t = norm(nome);
  if (t.indexOf('DISTRATO REALIZADO') >= 0) return 'distrato_realizado';
  if (t.indexOf('DISTRATO') >= 0) return 'distrato_aguardando';
  if (t.indexOf('AGUARDANDO ASSINATURA') >= 0) return 'aguardando_assinatura';
  return 'ativo';
}

// ---------------------------------------------------------------------------
// A ABA RESUMO como fonte do SALDO DEVEDOR.
//
// ⚠️ POR QUE ISTO EXISTE (26/08): a primeira versão pegava o saldo da linha de
// RODAPÉ de cada aba. Funcionou — mas só 24 das 73 abas TÊM esse rodapé. As
// outras 49 ficaram sem o número, que é justamente o que o cliente mais quer
// ver. Meia cobertura num campo assim não serve.
//
// A aba RESUMO traz SALDO DEVEDOR ATUALIZADO para TODAS as casas, e onde dá
// para comparar os dois valores batem (CASA 03: R$ 240.544,78 nos dois).
// Então o RESUMO manda, e o rodapé fica de reserva para o que ele não cobrir.
//
// Achada pelo CONTEÚDO (uma linha com a coluna das casas e a do saldo), não
// pelo nome: aba renomeada não pode derrubar o extrato inteiro.
// ---------------------------------------------------------------------------
// Acha o saldo da casa no mapa do RESUMO. Tenta o nome da unidade e o nome da
// aba sem o parêntese — "CASA 72(Permutante)" tem que casar com "CASA 72" do
// RESUMO, e a falta de espaço antes do parêntese é real na planilha.
function saldoDoResumo(mapa, unidade, nomeAba, reserva) {
  if (!mapa) return reserva;
  var chaves = [
    norm(unidade),
    norm(String(nomeAba).replace(/\(.*$/, '')),
    norm(String(unidade).replace(/\(.*$/, ''))
  ];
  for (var i = 0; i < chaves.length; i++) {
    if (chaves[i] && mapa[chaves[i]] !== undefined) return mapa[chaves[i]];
  }
  return reserva;
}

function lerResumo(abas) {
  // ⚠️ JUNTA TODAS as abas de resumo, não para na primeira (26/08). A primeira
  // versão parava — e as LOJAS ficaram sem saldo porque um resumo separado
  // delas, se existir, nunca seria lido. Parar na primeira também significaria
  // que criar uma aba de resumo nova, antes da atual, apagaria a antiga do mapa
  // sem ninguém entender por quê.
  var mapa = {};
  for (var i = 0; i < abas.length; i++) {
    var valores = abas[i].getDataRange().getValues();
    var linhaCab = -1;
    var colUnidade = -1;
    var colSaldo = -1;
    for (var r = 0; r < Math.min(valores.length, 15); r++) {
      var u = -1;
      var s = -1;
      for (var c = 0; c < valores[r].length; c++) {
        var t = norm(valores[r][c]);
        if (u === -1 && (t === 'CASAS' || t === 'CASA' || t === 'LOJAS' || t === 'LOJA'
          || t === 'UNIDADE' || t === 'UNIDADES' || t === 'IMOVEL' || t === 'IMOVEIS')) u = c;
        if (s === -1 && t.indexOf('SALDO DEVEDOR') === 0) s = c;
      }
      if (u !== -1 && s !== -1) { linhaCab = r; colUnidade = u; colSaldo = s; break; }
    }
    if (linhaCab === -1) continue;

    for (var r2 = linhaCab + 1; r2 < valores.length; r2++) {
      var nome = norm(valores[r2][colUnidade]);
      if (!nome) continue;
      var valor = valores[r2][colSaldo];
      if (!pareceNumero(valor)) continue;
      // Primeiro que achar manda: se duas abas trouxerem a mesma unidade, a que
      // vem antes na planilha vence. Sobrescrever calado seria pior — ninguém
      // saberia qual dos dois números o cliente está vendo.
      if (mapa[nome] === undefined) mapa[nome] = valor;
    }
  }
  return mapa;
}

function lerAba(aba, saldosDoResumo) {
  var valores = aba.getDataRange().getValues();
  if (!valores.length) return null;

  // 1. Acha a linha de cabeçalho: a que tem DATA e TIPO DE PARCELA juntos.
  //    Aba sem isso (RESUMO, anotações, o que for) é ignorada sozinha.
  var linhaCab = -1;
  for (var r = 0; r < Math.min(valores.length, 20); r++) {
    var temData = false;
    var temTipo = false;
    for (var c = 0; c < valores[r].length; c++) {
      var t = norm(valores[r][c]);
      if (t === 'DATA') temData = true;
      if (t.indexOf('TIPO DE PARCELA') === 0) temTipo = true;
    }
    if (temData && temTipo) { linhaCab = r; break; }
  }
  if (linhaCab === -1) return null;

  // 2. Mapeia coluna -> campo.
  var colunas = {};
  for (var c2 = 0; c2 < valores[linhaCab].length; c2++) {
    var campo = campoDoCabecalho(valores[linhaCab][c2]);
    if (campo && colunas[campo] === undefined) colunas[campo] = c2;
  }

  // 3. Cabeçalho da casa: varre TUDO que está acima da tabela procurando os
  //    rótulos. Não usa posição fixa — as células são mescladas e o layout
  //    varia de aba para aba.
  var empreendimento = '';
  var unidade = '';
  var comprador = '';
  var assinatura = '';
  var financiamento = '';
  var fgts = '';
  for (var r2 = 0; r2 < linhaCab; r2++) {
    for (var c3 = 0; c3 < valores[r2].length; c3++) {
      var bruto = String(valores[r2][c3] || '').trim();
      if (!bruto) continue;
      var n = norm(bruto);
      if (!empreendimento && r2 === 0) empreendimento = bruto;
      if (!unidade && /^CASA\s*\d+/.test(n)) unidade = bruto;
      if (!comprador && n.indexOf('COMPRADOR') === 0) comprador = depoisDoRotulo(bruto);
      if (!assinatura && n.indexOf('DATA DE ASS') === 0) assinatura = depoisDoRotulo(bruto);
      if (!financiamento && n.indexOf('FINANCIAMENTO') === 0) financiamento = depoisDoRotulo(bruto);
      if (!fgts && n.indexOf('FGTS') === 0) fgts = depoisDoRotulo(bruto);
    }
  }
  // Sem nome de casa no cabeçalho, o nome da aba serve — mas sem os dois a
  // aba não vira registro.
  if (!unidade) unidade = aba.getName().replace(/\s*\(.*\)\s*$/, '').trim();
  if (!empreendimento || !unidade) return null;

  // 4. As parcelas. Para quando a coluna DATA fica vazia por 5 linhas seguidas
  //    (a planilha tem linhas de sobra no fim, e às vezes um buraco no meio).
  var colData = colunas.data_vencimento;
  if (colData === undefined) return null;

  var parcelas = [];
  var vazias = 0;
  var valorVenda = null;
  var ignoradas = 0;
  var saldoAtual = null;
  for (var r3 = linhaCab + 1; r3 < valores.length; r3++) {
    var linha = valores[r3];
    var venc = linha[colData];
    if (!venc && venc !== 0) {
      vazias++;
      if (vazias >= 5) break;
      continue;
    }
    vazias = 0;

    // Tem conteúdo mas não é data: cabeçalho repetido, subtotal, anotação.
    // Não vira parcela. NÃO conta como linha vazia — senão um cabeçalho no meio
    // do caminho poderia fazer o leitor achar que a tabela acabou.
    if (!pareceData(venc)) {
      // ⚠️ Antes de descartar: a linha de RODAPÉ ("DEVEDOR ATUALIZADO") carrega
      // quanto a pessoa ainda deve HOJE — o número que o cliente mais quer ver
      // ao abrir o extrato. Descartar a linha inteira jogava esse número fora
      // junto com o lixo.
      // O valor fica na primeira célula numérica DEPOIS do rótulo (que é
      // mesclado em várias colunas). Pegar pela posição seria frágil: o rótulo
      // ocupa um número de colunas diferente de aba para aba.
      if (saldoAtual === null && norm(linha.join(' ')).indexOf('DEVEDOR ATUALIZADO') >= 0) {
        for (var z = 0; z < linha.length; z++) {
          if (pareceNumero(linha[z])) { saldoAtual = linha[z]; break; }
        }
      }
      ignoradas++;
      continue;
    }

    // VALOR VENDA aparece uma vez só, na primeira linha. Guarda a primeira que
    // vier preenchida e segue.
    if (valorVenda === null && colunas.valor_venda !== undefined) {
      var vv = linha[colunas.valor_venda];
      if (vv !== '' && vv !== null && vv !== undefined) valorVenda = vv;
    }

    var p = { ordem: parcelas.length + 1, data_vencimento: dataTexto(venc) };
    var campos = ['tipo_parcela', 'comissao', 'saldo_construtora', 'incc_percentual',
      'incc_valor', 'saldo_corrigido', 'parcela_construtora', 'igpm_valor',
      'parcela_corrigida', 'amortizacao', 'status_texto', 'saldo_devedor'];
    for (var k = 0; k < campos.length; k++) {
      var nome = campos[k];
      if (colunas[nome] !== undefined) p[nome] = linha[colunas[nome]];
    }
    parcelas.push(p);
  }

  return {
    empreendimento: empreendimento,
    unidade: unidade,
    comprador: comprador,
    status_contrato: statusDaAba(aba.getName()),
    data_assinatura: dataTexto(assinatura),
    valor_venda: valorVenda,
    financiamento_proposto: financiamento,
    fgts_proposto: fgts,
    aba_origem: aba.getName(),
    // RESUMO manda; o rodapé da própria aba é a reserva. Onde os dois existem
    // eles concordam — o RESUMO só cobre mais casas.
    saldo_devedor_atual: saldoDoResumo(saldosDoResumo, unidade, aba.getName(), saldoAtual),
    parcelas: parcelas,
    // Só para o relatório. A Central ignora campo que não conhece.
    _ignoradas: ignoradas
  };
}
