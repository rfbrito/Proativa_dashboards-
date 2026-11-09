# Cobrança de Rota: do SharePoint para o site, automaticamente

Objetivo: quando **você** salvar a planilha *Cobrança de Rota* no SharePoint, o site recebe a rota atualizada
sem ninguém importar arquivo. Só o seu fluxo tem a senha (segredo) para atualizar.

## Antes de começar
1. **Licença:** a ação **HTTP** do Power Automate é um conector *Premium*. Confirme com a TI se a sua licença inclui.
   Sem ela, não dá para enviar ao site automaticamente (a publicação manual continua funcionando).
2. **A Cobrança de Rota precisa estar formatada como Tabela do Excel**
   (selecione os dados → Inserir → Tabela; dê um nome, ex.: `TabelaRota`).
   Colunas necessárias: **Data, Nome, Código, Responsável** e **Pago?**; inclua também **Endereço** para ele aparecer na aba Rota do dia.
3. Rode no Supabase (SQL Editor) o arquivo `02_rota_automatica.sql`.
4. Pegue o segredo (só você deve ver). No SQL Editor:
   ```sql
   select valor from public.config where chave = 'segredo_rota';
   ```
   Copie o texto. Não envie por e-mail nem chat.

## Montar o fluxo (Power Automate → Criar → Fluxo de nuvem automatizado)
**Gatilho:** SharePoint — *Quando um arquivo é criado ou modificado (somente propriedades)*
- Endereço do site e Biblioteca: onde está a Cobrança de Rota.
- Pasta: a pasta do arquivo.
- Em **Configurações** do gatilho, ative *Condição de gatilho* e cole (troque pelo nome real do arquivo):
  `@equals(triggerOutputs()?['body/{FilenameWithExtension}'], 'Cobranca de Rota.xlsx')`

**Ação 1:** Excel Online (Business) — *Listar linhas presentes em uma tabela*
- Local / Biblioteca de Documentos: os mesmos do arquivo.
- Arquivo: use o caminho do arquivo (ou o conteúdo dinâmico *Identificador*).
- Tabela: `TabelaRota`.
- Em **Parâmetros avançados**: *Formato de data e hora* = **ISO 8601**.
- Em **Configurações**: ative *Paginação* com limite de 5000 (ou mais, se a rota for maior).

**Ação 2:** *HTTP*
- Método: `POST`
- URI: `https://tvewbqtuoqwbwzkyscim.supabase.co/rest/v1/rpc/rota_publicar`
- Cabeçalhos:
  - `apikey` = sua chave **publishable** (a mesma do arquivo do painel)
  - `Content-Type` = `application/json`
- Corpo (troque `COLE_O_SEGREDO`; os nomes entre aspas precisam ser iguais aos cabeçalhos da tabela):
  ```json
  {
    "p_segredo": "COLE_O_SEGREDO",
    "p_colunas": ["Data","Nome","Código","Responsável","Pago?"],
    "p_linhas": @{body('Listar_linhas_presentes_em_uma_tabela')?['value']},
    "p_arquivo": "Cobranca de Rota.xlsx"
  }
  ```
  (o nome entre parênteses é o da Ação 1 no seu fluxo; selecione-o pelo conteúdo dinâmico em vez de digitar).

**Ação 3 (opcional):** *Condição* — se o código de status da Ação 2 não for 200, enviar e-mail/Teams para você.

## Testar
1. Abra a Cobrança de Rota, altere qualquer célula e salve.
2. Em Power Automate → *Histórico de execuções*, veja se terminou com sucesso. A resposta deve ser
   `{"ok": true, "linhas": N, ...}`.
3. No site, abra **Recuperação** e clique em **Atualizar dados**.

## Como funciona e o que esperar
- A rota publicada é **substituída** pela da planilha. O painel lê a coluna **Pago?** (Sim = adimplente, Não = inadimplente,
  em branco = sem informação). O FINA740 não é mais usado.
- Linhas sem data são ignoradas. Linhas sem Responsável ficam visíveis só para admin/gestor.
- O Excel salva automaticamente várias vezes; o fluxo roda a cada salvamento. Não há problema (cada execução apenas
  repete a mesma publicação), mas, para reduzir execuções, ajuste *Concorrência* do gatilho para 1.
- Os atendentes veem a rota nova ao abrir o painel ou clicar em **Atualizar dados**.

## Segurança
- O segredo vale como senha: quem o tiver consegue substituir a rota publicada. Guarde só no fluxo.
- Para trocar o segredo: no SQL Editor rode
  `update public.config set valor = replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','') where chave='segredo_rota';`
  e atualize o corpo da Ação 2.
- Sem o segredo, a chamada é recusada (`nao_autorizado`). Ela não lê nenhum dado, só publica a rota.
