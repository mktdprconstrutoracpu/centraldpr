# Evolução da obra: como a Central mostra o que o painel de obras aprovou

Escrito em 13/10/2026. Pedido: "o que for para a Gestão é para aparecer no
painel de Aprovação, e aprovado a atualização tem que ir automático para a
Central".

## O caminho de uma atualização

1. A obra entra no painel **Gestão do Cliente** (repo `gestao-do-cliente`), aba
   Gestão de obras, e envia o mês, o texto, o percentual e as fotos. Nasce
   `aguardando`.
2. Luana ou Rodrigo entram na aba Aprovação e aprovam, pedem ajuste ou
   recusam. Só o aprovador muda a situação; o banco carimba quem e quando.
3. A Central do Cliente, na página **Evolução da obra**, lê o que está com
   situação `aprovada`. Não há sincronização nem botão: as duas telas usam o
   mesmo Supabase (`roashkfdjgsweuftqhyx`), então o aprovado aparece na hora,
   na próxima abertura da página.

## O elo entre a casa e a obra

O nome do empreendimento. Na Central, cada casa tem `unidades.empreendimento`
(texto, vem da planilha, por exemplo "VILLAGIO CAUCAIA II"). No painel de
obras, o gestor cadastra o empreendimento com o mesmo nome em
`obras_empreendimentos.nome`. A comparação ignora maiúsculas e espaços nas
pontas, mas o resto tem que ser igual, letra por letra. Se o nome for
diferente, a Central não acha a obra e continua mostrando a demonstração.

## O que protege o dado

O RLS do banco, escrito em `gestao-do-cliente/sql/001_obras.sql`: o cliente
(login da Central com vínculo aprovado) só lê o empreendimento cujo nome bate
com o da casa dele, as etapas dele, as atualizações `aprovada` dele e as fotos
dessas atualizações. A consulta da Central pede `situacao = 'aprovada'` por
clareza; se alguém chamar a API por fora, o banco devolve o mesmo. Não foi
preciso rodar SQL novo para esta etapa.

## O que a página mostra

- **Andamento geral**: o percentual da atualização aprovada mais recente que
  trouxe um número. Se nenhuma trouxe, a conta é etapas concluídas sobre o
  total.
- **Etapa atual**: a etapa em andamento; senão a última concluída; senão a
  primeira a fazer.
- **Previsão de entrega**: `previsao_entrega` do empreendimento ("Dez / 2027"),
  ou "a definir".
- **Barra**: as etapas reais do empreendimento, espalhadas por igual, com a
  marca da concluída e da atual.
- **Atualizações da obra**: as aprovadas, da mais recente para a mais antiga,
  agrupadas pelo mês (`data_referencia`, dia 1 do mês), cada uma com a etapa,
  o percentual, o título, o mês, a data de publicação, o texto e as fotos: a
  primeira grande, as outras em miniatura; todas abrem em tamanho cheio.
- Enquanto o empreendimento da casa **não estiver cadastrado** no painel de
  obras, a página continua com o **conteúdo de demonstração** avisado em
  amarelo, como antes. Cadastrado e sem nenhuma aprovada: "Ainda não há
  atualizações aprovadas desta obra".
- Se a leitura falhar (rede), a demonstração fica e o erro vai para o console:
  página vazia seria pior que a demonstração avisada.

## Onde está no código

Tudo em `index.html`: o bloco `#obraDemo` (a demonstração de antes), o bloco
`#obraReal` (preenchido por `renderizarObra()`), e as funções `carregarObra()`
e `renderizarObra()`, chamadas no fim de `renderizarExtrato()`, porque a obra
depende de saber qual é a casa. As datas de mês são lidas do texto
(`AAAA-MM`), sem `Date`, para o dia 1 não virar o mês anterior por fuso.

## Como testar sem rede

`scratchpad/win/ver-central-obra.cjs` (puppeteer, node do Windows) carrega a
Central com `scratchpad/central_supabase_falso.js` no lugar do CDN do
Supabase e três cenários: empreendimento cadastrado com aprovadas e fotos
(mais uma aguardando e uma recusada, que não podem aparecer), não cadastrado
(fica a demonstração) e cadastrado sem aprovadas. Capturas em
`scratchpad/capturas/central`.
