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
obras, o gestor cadastra o empreendimento em `obras_empreendimentos.nome`. A
comparação ignora maiúsculas e espaços nas pontas.

Em 13/10 o painel estava com "Villagio Caucaia 2" e a Central com "VILLAGIO
CAUCAIA II", e nada aparecia. Ela: "a Central vai aparecer de um
empreendimento só, então tudo que entrar na gestão de obra pode ir pra
Central". Regra desde então: a Central usa o empreendimento de nome igual ao
da casa; **se não houver e o painel tiver um empreendimento só, usa esse**.
Com dois ou mais e nenhum nome igual, fica a demonstração, para não mostrar a
obra errada. Quando houver mais de um empreendimento, é só deixar os nomes
iguais aos da Central.

## O que protege o dado

O RLS do banco, escrito em `gestao-do-cliente/sql/001_obras.sql` e ajustado
pelo `sql/004_cliente_ve_a_obra.sql` (13/10): o cliente (login da Central com
vínculo aprovado) lê os empreendimentos em acompanhamento, as etapas deles,
as atualizações `aprovada` deles e as fotos dessas atualizações. Nada que não
esteja aprovado chega ao cliente. A consulta da Central pede
`situacao = 'aprovada'` por clareza; se alguém chamar a API por fora, o banco
devolve o mesmo. O 004 precisa ser rodado no SQL Editor do Supabase; sem
ele, a trava antiga (nome igual) continua valendo.

## O que a página mostra

- **O painel** (14/10): um cartão escuro com o **anel** do andamento geral (o
  percentual da atualização aprovada mais recente que trouxe um número; se
  nenhuma trouxe, a conta é etapas concluídas sobre o total), a **etapa atual**
  (a em andamento; senão a última concluída; senão a primeira a fazer) com a
  nota "em andamento · informado em outubro de 2026", e três fatos: **Início**
  (`inicio_obra`), **Entrega prevista** (`previsao_entrega`, ou "a definir") e
  **Tempo de obra** ("8 de 22 meses": meses do início até o mês de hoje sobre
  os meses do início à entrega, com uma barra; some quando falta uma das
  datas). A barra não compara o tempo com o andamento: a obra não é linear e
  a comparação automática poderia dizer ao cliente algo que a DPR não disse.
- **Etapas da obra**: as etapas reais do empreendimento, passo a passo, com
  check na concluída, a atual pulsando em vermelho e as próximas em cinza;
  a previsão de cada etapa, se cadastrada ("previsão Mar / 2027"). Em coluna
  no celular.
- **Atualizações da obra**: as aprovadas, da mais recente para a mais antiga,
  agrupadas pelo mês (`data_referencia`, dia 1 do mês), cada uma com a etapa,
  o percentual, o título, o mês, a data de publicação, o texto e as fotos em
  **mosaico** (uma grande e até duas pequenas; da quarta em diante, "+N" sobre
  a última). Tocar numa foto abre a mesma tela cheia do Projeto 3D, com todas
  as fotos daquela atualização, setas e arrastar.
- No celular, a foto do topo da página (a mais recente aprovada, ou a do
  empreendimento) aparece inteira na largura da tela, com a proporção da
  própria imagem (no máximo 4:3, para uma foto em pé não tomar a tela).
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
