# Acesso por e-mail com código (18/11/2026)

O cliente não precisa mais esperar a DPR liberar. O acesso funciona assim:

1. A DPR cadastra no **Financeiro** o e-mail do comprador (e, se houver, o do cônjuge) na ficha da casa.
2. O cliente cria a conta na Central com esse e-mail.
3. Chega no e-mail dele um **código de confirmação**.
4. Ele digita o código na Central. A conta é confirmada e a Central liga a pessoa a **todas as casas com aquele e-mail**, já liberadas.

Se o e-mail não estiver em nenhuma ficha, a Central avisa para falar com a DPR e conferir o e-mail cadastrado.
Quem já tinha acesso continua igual.

## O que fazer no Supabase (projeto da Central), uma vez

### 1. Rodar o SQL
SQL Editor > New query > colar o conteúdo de `sql/003_acesso_por_email.sql` > Run.
Pode rodar mais de uma vez sem problema.

### 2. Confirmação de e-mail ligada
Authentication > Sign In / Providers > Email: deixe **Confirm email** ligado.

### 3. Trocar o e-mail de confirmação para mandar o código
Authentication > Emails (Email Templates) > **Confirm signup**.

Assunto:

    Seu código de acesso à Central do Cliente DPR

Corpo (cole no lugar do que estiver lá):

    <h2>Central do Cliente DPR</h2>
    <p>Olá! Use o código abaixo para confirmar seu e-mail e liberar o seu acesso:</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
    <p>O código vale por 1 hora. Se você não pediu este cadastro, ignore este e-mail.</p>
    <p>DPR Construtora</p>

O importante é o `{{ .Token }}`: é ali que entra o código. Não use o `{{ .ConfirmationURL }}`.

### 4. Servidor de e-mail próprio (obrigatório para clientes de verdade)
O envio que vem de fábrica no Supabase é só para teste: manda poucos e-mails por hora e, em projetos novos,
só entrega para os e-mails da equipe do projeto. Para os clientes receberem o código:

1. Crie uma conta no **Resend** (resend.com; gratuito até 3 mil e-mails por mês).
2. Em Domains, adicione `construtoradpr.com.br` e copie os registros de DNS que ele mostrar para o painel
   de quem administra o domínio. Espere o Resend marcar o domínio como verificado.
3. Em API Keys, crie uma chave. **Não mande a chave por mensagem**: cole direto no Supabase.
4. No Supabase: Authentication > Emails > SMTP Settings > Enable Custom SMTP:
   - Host: `smtp.resend.com` · Port: `465` · Username: `resend` · Password: a chave do Resend
   - Sender email: `naoresponda@construtoradpr.com.br` · Sender name: `DPR Construtora`

## Como testar
1. No Financeiro, ponha o seu e-mail no campo "E-mail do comprador" de uma casa de teste e salve.
2. Na Central, "Primeiro acesso" com esse e-mail.
3. Digite o código que chegar. O extrato da casa de teste deve abrir na hora.
