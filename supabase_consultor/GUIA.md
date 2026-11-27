# Painel do Consultor GLP: como configurar (Supabase próprio)

Tempo: uns 20 minutos. Não precisa programar.

## 1. Criar o projeto no Supabase
1. Entre em https://supabase.com e clique em **New project**.
2. Nome: `painel-consultor`. Região: **South America (São Paulo)**. Defina e guarde a senha do banco.
3. Espere uns 2 minutos até o projeto ficar pronto.

## 2. Criar o banco
1. Menu da esquerda: **SQL Editor > New query**.
2. Cole todo o conteúdo de `supabase_consultor/01_banco_consultor.sql` e clique em **Run**.
3. Deve aparecer "ok — resumos criados".

## 3. Ligar o painel ao projeto
1. **Project Settings > API** (ou **Data API**): copie a **Project URL** e a chave **publishable** (ou **anon public**).
2. No GitHub, abra o arquivo `config.js` do repositório, clique no lápis (editar), cole os dois valores entre as aspas e clique em **Commit changes**.
   (Ou mande os dois valores para o Claude, que ele faz isso.)

## 4. Endereço do site (para os links de e-mail)
**Authentication > URL Configuration**
- **Site URL**: `https://rfbrito.github.io/Proativa_dashboards-/painel_consultor.html`
- **Redirect URLs**: adicione o mesmo endereço.

## 5. Criar o primeiro administrador (você)
1. Abra o painel, toque em **Criar conta**, cadastre-se e confirme pelo e-mail.
2. No **SQL Editor**, rode (com o seu e-mail):
   ```sql
   update public.perfis set papel = 'admin', ativo = true where email = 'SEU_EMAIL';
   ```
3. Entre no painel. No menu (toque no seu nome) aparecem **Importar planilhas** e **Usuários**.

## 6. Carregar os dados
Menu > **Importar planilhas**. Dá para escolher vários arquivos de uma vez:
- **VENDA POR VENDEDOR DIÁRIO.xlsx** (aba BASE): vendas por nota. O período do arquivo substitui o que já estava gravado.
- **banco_carteiras_AAAA-MM-DD.json** (exportado da aba Carteiras): consultor de cada cliente, previsão de consumo e donos do tanque.
- **GESTÃO DE CONTRATOS.xlsx** (Planner > Exportar plano para Excel): 1º abastecimento. Substitui os contratos.
- **RelFinCliente.xlsx** (TOTVS, opcional): cidade, status, preço de tabela, primeira e última compra. É ele que permite achar **tanques parados há 3 anos** e **clientes novos**.

## 7. Liberar os consultores
1. Cada consultor abre o painel e toca em **Criar conta**.
2. Você abre **Usuários**, escolhe **Consultor**, a **carteira** (FRANK, MAURO, PEDRA, FRANKLIN, VINICIUS, FABIO), marca **Liberado** e salva.
3. O consultor só recebe do banco os dados da própria carteira. Gestores e administradores veem todos.

## Bom saber
- O Supabase gratuito envia poucos e-mails por hora. Para muitos cadastros, configure um SMTP em **Authentication > SMTP Settings**.
- O plano gratuito pausa o projeto depois de 1 semana sem uso.
- "Esqueci a senha" funciona pelo próprio painel.
