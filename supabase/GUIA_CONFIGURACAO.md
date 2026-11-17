# LEIA PRIMEIRO (v28)

## 1. Corrigir o erro "dados_meta_painel_check" (uma vez só)
1. Abra o Supabase > **SQL Editor** > **New query**.
2. Cole o conteúdo de `supabase/06_tudo_em_um.sql` e clique em **Run**. Deve aparecer "ok — banco pronto para a Base de Clientes".
3. Volte ao painel e importe de novo. Esse arquivo substitui o 04 e o 05 e pode ser rodado quantas vezes quiser.

## 2. Rotina diária (só gestor e administrador)
Menu **Central de importação**:
1. **Venda diária**: a planilha de notas fiscais (aba BASE). Atualiza o faturamento, por dia e por consultor. Os meses que vierem no arquivo substituem os mesmos meses já gravados.
2. **Relatório de vendas por cliente** (RelFinCliente do TOTVS): atualiza o cadastro e a carteira de todos os consultores e traz os clientes novos, com código e dados.
3. Clique em **Importar agora**.
Quem só consulta não tem nenhum botão de envio.

## 2b. Histórico: nada é apagado
- Cada importação **soma** ao que já existe. Um mês só é substituído se o arquivo novo for **tão recente quanto** o que está gravado. Se você enviar um arquivo mais antigo depois de um de hoje, o de hoje é mantido e a tela avisa quais meses foram mantidos.
- Cliente que sumir do relatório continua cadastrado.
- **Histórico anual (Bases_Infos)**: o terceiro campo da Central traz as notas fiscais desde jan/2025 e os totais mensais da empresa (faturamento, volume, clientes faturados, vendas, devoluções). Envie uma vez por mês. Na Base de Clientes, aba Faturamento, o bloco **Ano a ano** compara os anos. Gestores veem os totais da empresa; cada consultor vê o ano a ano da própria carteira.

## 3. O que a Base de Clientes faz sozinha
- **Painel**: previsto × realizado, atingimento, preço médio, classificação, recência, top 10, atenção, quedas e superações, municípios, condição de pagamento, concentração de 80%, resumo por consultor.
- **Retirados**: clientes fora da carteira, com o motivo (preço de tabela abaixo do mínimo, vendedor fora da lista, inativo sem consumo, sempre excluído).
- **Reatribuição**: cliente com vendedor "ALTERACAO CADASTRAL" ou "ENCERRAMENTO DAS ATIVIDADES" que ainda consome volta ao consultor anterior.
- **Parâmetros** (Central de importação > Parâmetros da carteira): preço mínimo, alerta de preço, corte de kg, marcos de recência, dias de cliente novo, piso da projeção, metas mensais, lista de excluídos e de fixos. Valem na hora, sem reimportar.
- **Projeção de consumo**: para trazê-la, envie uma vez as carteiras individuais (opção "carteiras individuais com consumo projetado"). Depois ela é mantida.
- Cada consultor só vê os próprios clientes e o próprio faturamento. Gestores e administradores veem todos.

---

# Painéis GLP — guia de configuração (Supabase)

Tempo estimado: 20–30 minutos. Quem faz: você (ou a TI). Não precisa programar.

## O que muda em relação ao login anterior
O login deixa de ser uma senha dentro do arquivo e passa a ser um sistema real:
cadastro, entrar, "esqueci minha senha" por e-mail, aprovação pelo administrador,
papéis (admin, gestor, atendente) e **dados separados por pessoa, protegidos no servidor**.
Se a Stephanie abrir o painel, o servidor só entrega a ela as linhas em que ela é a responsável.

## Passo 1 — Criar o projeto no Supabase
1. Acesse https://supabase.com e crie uma conta (pode entrar com o e-mail da empresa).
2. **New project** → nome `paineis-glp`, região **South America (São Paulo)**, defina uma senha do banco (guarde-a).
3. Aguarde ~2 minutos até o projeto ficar pronto.

## Passo 2 — Criar as tabelas e regras de acesso
1. No menu à esquerda: **SQL Editor** → **New query**.
2. Abra o arquivo `01_schema.sql`, copie **tudo**, cole e clique em **Run**. Deve aparecer "Success".
3. (Opcional, recomendado) Limitar quem pode se cadastrar ao e-mail da empresa. Nova query:
   ```sql
   insert into public.config (chave, valor) values ('dominio_email', 'glpgas.com.br')
   on conflict (chave) do update set valor = excluded.valor;
   ```
   (troque pelo domínio real; sem isso qualquer e-mail consegue *se cadastrar*, mas continua sem acesso a nada até você aprovar).

## Passo 3 — Pegar a URL e a chave
**Project Settings → API**. Copie:
- **Project URL** (algo como `https://abcdxyz.supabase.co`)
- **anon public** key

Abra `Painel_de_Atendimento_v10.html` num editor de texto (Bloco de Notas serve), procure `CONFIGURAÇÃO` e preencha:
```js
const SUPABASE_URL="https://abcdxyz.supabase.co";
const SUPABASE_ANON_KEY="eyJ...";
```
A chave *anon* é pública por desenho — o que protege os dados são as regras do banco (RLS) criadas no passo 2.
**Nunca** coloque no arquivo a chave `service_role`.

## Passo 4 — Autorizar o endereço do site (necessário para "esqueci minha senha")
**Authentication → URL Configuration**
- **Site URL**: o endereço onde o painel ficará (ex.: `https://paineis.glpgas.com.br/`)
- **Redirect URLs**: adicione o mesmo endereço.

## Passo 5 — E-mails (cadastro e recuperação de senha)
**Authentication → Providers → Email**: deixe *Confirm email* ligado (recomendado).
O Supabase envia os e-mails sozinho, mas o serviço padrão tem limite baixo (poucos e-mails por hora).
Para uso diário, configure um SMTP da empresa em **Authentication → SMTP Settings**
(a TI informa servidor, porta, usuário e senha do e-mail da GLP).
Também em **Authentication → Email Templates** você pode traduzir os textos para português.
Em **Authentication → Providers → Email** defina senha mínima de 8 caracteres.

## Passo 6 — Criar o primeiro administrador (você)
1. Abra o painel, clique em **Criar conta** e cadastre seu e-mail e senha. Confirme pelo e-mail recebido.
   Você cairá na tela "aguardando liberação" — é normal.
2. No Supabase → **SQL Editor**, rode (trocando pelo seu e-mail):
   ```sql
   update public.profiles
      set role = 'admin', ativo = true, paineis = '{rec,hub,aba,ger,sla,cart}'
    where email = 'SEU_EMAIL@glpgas.com.br';
   ```
3. Entre de novo no painel. Agora aparecem **Usuários** e **Dados dos painéis** na lateral.

## Uso no dia a dia
**Liberar uma pessoa:** ela se cadastra → você abre **Usuários** → ela aparece como *pendente* →
escolha o **papel**, preencha **Nome nas planilhas** (ex.: `Stephanie`, exatamente como aparece
na coluna Responsável/Vendedor/Atendente), marque os **painéis** e salve.

| Papel | O que vê |
|---|---|
| admin | Tudo, inclusive Usuários e Dados |
| gestor | Dados de **todas** as pessoas nos painéis liberados; pode publicar planilhas |
| atendente | Apenas as **próprias** linhas em Recuperação, Hub e Abastecimento |
| pendente | Nada |

**Publicar dados:** em **Dados dos painéis**, escolha a planilha, confira a prévia (linhas por pessoa)
e clique **Publicar**.
- Recuperação: publique a Cobrança de Rota com a coluna **Pago?** (Sim/Não) preenchida. Cada publicação substitui a anterior. O painel não usa mais o FINA740.
- Hub e Abastecimento: cada publicação substitui a base anterior.
- Linhas sem responsável (totais etc.) ficam visíveis só para admin/gestor.

**Esqueci a senha:** na tela de login → *Esqueci minha senha* → o link chega por e-mail.

**Bloquear alguém:** em Usuários, desmarque *liberado* e salve.

## Pontos de atenção (leia)
1. **Só Recuperação, Hub e Abastecimento têm dados separados por pessoa no servidor.**
   Gerador de tickets, SLA de clientes novos e Carteiras são controlados por *painel liberado ou não*
   (a tela esconde), mas o **código** desses painéis e a base inicial do SLA continuam dentro do
   arquivo HTML. Quem conseguir baixar o arquivo consegue ler esses dados. Por isso, hospede o
   arquivo atrás de uma proteção de acesso (Cloudflare Access / Entra ID — ver `LEIA-ME_TI.md`)
   *ou* peça para mover a base do SLA para o banco (fica como próximo passo).
2. Carteiras e SLA guardam planilhas no navegador de cada usuário (não passam pelo servidor).
3. Ao sair, o painel apaga os dados locais de Recuperação do navegador, para que a próxima pessoa
   no mesmo computador não veja os dados da anterior.
4. O administrador não consegue trocar a senha de outra pessoa; ela usa "Esqueci minha senha".
5. A base de Abastecimento no formato antigo (sem coluna VENDEDOR) fica visível só para admin/gestor.
6. Faça backup: **Project Settings → Database → Backups** (planos pagos têm backup diário).
7. O plano gratuito do Supabase pausa o projeto após 1 semana sem uso. Para uso em produção, considere o plano Pro.

## Se algo não funcionar
| Sintoma | Causa provável |
|---|---|
| "Falta configurar o Supabase" | Passo 3 não feito |
| Link do e-mail leva a página errada | Passo 4 (Site URL / Redirect URLs) |
| "Este e-mail não está autorizado" | Domínio limitado no passo 2 |
| Atendente entra e vê painel vazio | Falta o **Nome nas planilhas** ou os dados não foram publicados |
| "Você não tem permissão" ao publicar | Só admin (ou gestor com o painel liberado) publica |

---

## Meta única da Recuperação (obrigatório a partir da v18)

No Supabase, abra **SQL Editor → New query**, cole todo o arquivo `03_meta.sql` e clique em **Run**.
Isso cria a meta única (começa em 58). Só **administrador** e **gestor com acesso à Recuperação** conseguem alterá-la; atendentes veem o valor, mas o campo fica bloqueado.


---

## Painel "Base de Clientes" (consumo completo de cada cliente)

**1. Banco (uma vez):** no SQL Editor do Supabase rode `04_base_clientes.sql` (depois dos outros). Pode rodar de novo sem problema.

**2. Cadastro dos consultores:** em *Usuários*, para cada consultor marque o painel **Base de Clientes** e preencha **Nome nas planilhas** com o nome que aparece na carteira dele (célula B1 da aba *Painel*: PEDRA, FRANK, MAURO, FRANKLIN, VINICIUS, FABIO). Quem tiver esse nome só enxerga os clientes da própria carteira.

**3. Publicar (gestor/admin):** *Dados dos painéis → Base de Clientes*. Selecione de uma vez as carteiras (`Carteira_…xlsx`) e/ou a venda diária (`VENDA_POR_VENDEDOR_DIARIO.xlsx`, aba BASE) e o faturamento (notas fiscais). Regras:
- Carteiras: substituem só os consultores enviados; os demais continuam.
- Vendas: os meses enviados substituem os mesmos meses já publicados; meses antigos são mantidos. Se dois arquivos trazem o mesmo mês, vale o que tiver a emissão mais recente.
- Pode publicar só carteiras ou só vendas: o outro lado é preservado e a atribuição de cliente → consultor é refeita.

**4. Uso:** o consultor abre Base de Clientes, filtra por código, documento ou nome (ou clica na linha), vê o consumo total, receita, preço médio, NFs, devoluções e o histórico mensal, e baixa o Excel (Resumo, Clientes, Consumo por mês, Receita por mês) do cliente aberto ou de toda a carteira filtrada.

**Limites:** o endereço vem da carteira (loja 01); não há data de início/fim de contrato; o histórico vai até onde foram publicadas as vendas; clientes com venda que não estão em nenhuma carteira só aparecem para admin/gestor.


---

## Painel "Mesa de Preços"

Painel novo no menu, com os pedidos de alteração de preço (quadro, prazo de corte, kit para o gestor). Rode de novo o `04_base_clientes.sql` (ele agora também libera o painel `mesa`) e marque **Mesa de Preços** em *Usuários* para quem for usar (normalmente admin/gestor). Os pedidos e a base ficam salvos **no navegador de cada usuário** (uma chave por login); use o botão de backup do próprio painel para guardar uma cópia.

---

## "Fulano não vê nada atualizado" — o que mudou na v23 e como conferir

**O que o site passou a fazer sozinho**
- Confere a cada 3 minutos (e ao voltar para a aba/janela) se há publicação nova; se houver, recarrega Recuperação, Hub, Abastecimento e Base de Clientes e avisa na tela.
- Se não encontrar nada para a pessoa, aparece uma **faixa amarela fixa no topo do painel** explicando o motivo, e os dados antigos guardados no navegador são apagados (antes ficavam na tela sem aviso).
- Se der erro de conexão, a faixa avisa que o que aparece pode estar desatualizado e oferece "Tentar de novo".

**Diagnóstico para o administrador**
1. Rode **05_diagnostico.sql** no SQL Editor do Supabase (uma vez).
2. Em **Usuários**, o topo mostra quem não enxerga linhas e quais nomes publicados nas planilhas não têm dono. Causa mais comum: grafia diferente (ex.: planilha com *Iasmim*, usuário com *Iasmin*). Corrija em *Nome nas planilhas* (pode usar várias grafias separadas por vírgula: `Iasmim, Iasmin`).

---

## Cadastrando os consultores e os gestores (Daniel e Giuseppe)

1. Cada pessoa cria a conta pela tela de login (**Criar conta**). Ela fica *pendente*.
2. Em **Usuários**, abra o cartão da pessoa e use o campo **Perfil rápido**:
   - **Consultor** → papel atendente, só o painel *Base de Clientes*. Preencha **Nome nas planilhas** com o nome do consultor igual ao da carteira (ex.: `PEDRA`). Embaixo do campo aparecem botões com os nomes que já estão publicados: é só tocar neles.
   - **Gestor** (Daniel e Giuseppe) → vê todos os consultores, tem o seletor de consultor e pode publicar planilhas em *Dados dos painéis*.
3. Clique em **Salvar**.

**Privacidade entre consultores:** o filtro é feito no banco (RLS), não na tela. Um consultor só recebe as linhas em que o nome dele é o consultor da carteira; mesmo consultando o banco direto, nada de outro consultor volta. Atenção: o vínculo usa a **primeira palavra** do nome (PEDRA, FRANK, FRANKLIN são distintos; dois consultores com o mesmo primeiro nome enxergariam a mesma carteira — a tela de Usuários avisa nesse caso).

---

## Rotina de atualização da Base de Clientes (v25)

Só administrador e gestor publicam; consultores apenas consultam a própria carteira.

Em **Dados dos painéis → Base de Clientes** use dois arquivos:

| Arquivo | O que atualiza | Quando |
|---|---|---|
| **RelFinCliente (TOTVS)**, o mesmo que você já usa para montar a carteira | Cadastro e carteira de **todos** os consultores de uma vez (coluna *Vendedor*), status, endereço, preço de tabela, última compra | Quando quiser atualizar a base |
| **Venda diária** (e/ou notas fiscais) | Só o consumo, a receita e as notas por mês | Todo dia / semana |

Publicar um não apaga o outro. A previsão de consumo e o dono do tanque vêm das carteiras por consultor (`Carteira_…_NOME.xlsx`) e são preservados quando você publica o RelFinCliente.

**Como o consultor é identificado:** primeira palavra do *Vendedor* (FRANK, FRANKLIN, MAURO, VINICIUS, FABIO). Exceção: *Carlos Pedra de Oliveira* = **PEDRA**. Clientes cujo vendedor é um código (INATIVO, CONCORRENCIA, ENCERRAMENTO DAS ATIVIDADES, etc.) ficam em **(sem carteira)** e só gestor/admin veem. Para outra exceção de nome, edite `CONSULTOR_ALIAS` no início da função de leitura da Base de Clientes.

## v29 — Base de Clientes no formato do Power BI
Páginas (menu à esquerda dentro da Base de Clientes): **Carteira de Clientes**, **Operação Diária** (com D-1), **Base de Clientes** (análise individual e trajetória) e **Retirados**.
Para o histórico completo (comparativos com o mesmo mês do ano anterior e gráfico desde jan/2025), importe também o **Bases_Infos** no campo 3 da Central de importação. A previsão (linha dourada e barras de atingimento) aparece depois de importar as carteiras individuais (opcional).

## v30 — Relatório Comercial e painéis claros
O painel "Base de Clientes" agora se chama **Relatório Comercial**, com duas abas: **Clientes** (consumo, receita e preço por cliente, busca e trajetória individual) e **Consultores** (totais por consultor, carteira, histórico e operação diária com D-1). A aba Retirados saiu da tela; as regras de retirada continuam valendo nos números. Todos os painéis (Recuperação, Hub, Abastecimento, Gerador, SLA, Carteiras e Mesa de Preços) passaram para o tema claro.

## v38 — Mesa de Preços compartilhada
1. Rode `07_liberar_mesa.sql` (libera o painel "mesa" para gestores) e depois `08_mesa_compartilhada.sql` (cria a tabela `mesa_estado`).
2. Publique o HTML v38 e peça para todos saírem e entrarem de novo.
3. Na primeira abertura, os pedidos que já existiam no navegador de quem abrir primeiro (admin/gestor) sobem para o banco; a partir daí todos com acesso veem os mesmos cards. Alterações simultâneas são mescladas por pedido (vale a edição mais recente).
