# Sincronização da planilha com a Central

Como os dados das casas saem da planilha e chegam no extrato do cliente.

## O caminho

```
Planilha  --(script, uma casa por vez)-->  Central  --(chave de serviço)-->  Supabase
```

**Por que a planilha não escreve direto no banco:** escrever exige a chave de
serviço do Supabase, que passa por cima de todas as travas de acesso. Quem pode
editar a planilha consegue abrir o script dentro dela e ler essa chave — e
passaria a ter acesso total ao banco, inclusive aos dados de login dos clientes.

Assim, a chave fica só na Vercel. A planilha carrega uma senha própria, que só
serve para mandar dados de casa. Se ela vazar, o estrago é limitado a isso.

## Configuração — parte 1: Vercel

`Settings` → `Environment Variables`. Três variáveis, **nunca** marcadas como
públicas:

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | `https://roashkfdjgsweuftqhyx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | a chave de **serviço** do Supabase (`sb_secret_…`) |
| `SYNC_SECRET` | uma senha inventada por você, longa |

A chave de serviço fica no Supabase em `Settings` → `API keys`, na parte de
baixo. Ela é diferente da chave publicável que está no `index.html`.

⚠️ Variável nova só vale no próximo deploy. Depois de salvar, redeploye.

## Configuração — parte 2: planilha

Na planilha: `Extensões` → `Apps Script`. Cole o conteúdo de
[apps-script/sincronizar.gs](apps-script/sincronizar.gs).

Depois, `Configurações do projeto` → `Propriedades do script` → `Adicionar`:

| Nome | Valor |
|---|---|
| `CENTRAL_URL` | `https://<endereço da Central>/api/sincronizar` |
| `SYNC_SECRET` | **a mesma** senha da Vercel |

⚠️ A senha vai nas Propriedades do script, não no código. Quem abre a planilha
abre o código.

## Rodando

No Apps Script, escolha a função `sincronizarTudo` e clique em Executar.

O resultado aparece em `Execuções` → o registro da execução:

```
--- CONCLUIDO ---
casas enviadas: 66
abas ignoradas (sem tabela de parcelas): 1
falhas: 0
```

**Se aparecer `PAUSADO`:** o Google encerra qualquer execução em 6 minutos, e o
script para sozinho aos 4,5 para dar tempo de salvar onde parou. É só executar
de novo — ele continua da aba seguinte. Com ~80 abas, espere duas ou três
execuções.

Para recomeçar do zero, execute `recomecarDoZero`.

## O que o script decide sozinho

**As colunas são achadas pelo nome do cabeçalho**, nunca pela posição. Se um dia
inserirem uma coluna no meio da planilha, nada quebra.

**Abas sem tabela de parcelas são ignoradas.** O script procura uma linha que
tenha `DATA` e `TIPO DE PARCELA` juntos; sem isso, pula. É assim que a aba
RESUMO fica de fora sem ninguém precisar configurar nada.

**O status do contrato sai do nome da aba:**

| Nome da aba | Status gravado |
|---|---|
| `CASA 03` | `ativo` |
| `CASA 01 (Aguardando assinatura)` | `aguardando_assinatura` |
| `CASA 02 (Distrato - aguardando)` | `distrato_aguardando` |
| `CASA 05 (Distrato)` | `distrato_aguardando` |
| `CASA 04 (Distrato realizado)` | `distrato_realizado` |

⚠️ `(Distrato)` sozinho é tratado como *aguardando*. Se para vocês significa
outra coisa, é uma linha para mudar em `statusDaAba`.

## Rodar de novo é seguro

**Casa:** identificada por empreendimento + unidade. Rodar de novo atualiza, não
duplica.

**Parcelas:** identificadas por casa + posição na planilha. A linha 7 da planilha
é sempre a linha 7 do banco, **atualizada no lugar**.

Isso é deliberado e não é detalhe: o caminho fácil seria apagar todas as parcelas
e regravar. Entre o apagar e o regravar existe um instante em que o cliente
abriria o extrato e veria um extrato vazio — e se o regravar falhasse no meio,
ficaria vazio de vez. Foi exatamente esse erro que custou caro na loja em 25/08.

**Se a planilha encurtar** (alguém apagou linhas do fim), as parcelas que
sobraram do fim são removidas — por último, depois de o novo já estar gravado.

## Casa sem comprador é recusada

A Central devolve erro e a casa aparece em `falhas` no relatório.

É proposital: sem o nome do comprador, a casa não casa com ninguém no login e a
linha no banco não serviria para nada. Melhor aparecer no relatório do que virar
um registro morto que ninguém percebe.

Na varredura de 25/08 havia **uma aba com o campo COMPRADOR vazio**.

## Depois de sincronizar

Os dados entram nas tabelas, mas **o cliente ainda não vê nada** — falta o
vínculo entre a conta dele e a casa, que nasce pendente e é aprovado pela DPR.
Ver [sql/001_extrato_cliente.sql](sql/001_extrato_cliente.sql).
