# Fluxo do Power Automate: Planner → painel

O fluxo grava, todo dia, um arquivo `planner_contratos.json` na pasta do SharePoint que o computador do robô sincroniza. O robô lê esse arquivo e atualiza os contratos no painel. Só usa ações gratuitas (Planner, Variáveis, Compor e SharePoint), sem Premium.

Abra https://make.powerautomate.com com a conta da GLP que enxerga o plano **Gestão de Contratos**.

## 1. Criar o fluxo
1. **Criar > Fluxo da nuvem agendado.**
2. Nome: `Planner para o painel`. Repetir a cada **1 Dia**, começando hoje às **06:00**. **Criar**.
3. Clique no gatilho **Recorrência** e, em **Fuso horário**, escolha **(UTC-03:00) Brasília**. Se quiser atualizar mais vezes por dia, em **Nessas horas** coloque, por exemplo, `6,12,18`.

## 2. Variável das tarefas
**+ Nova etapa > Inicializar variável**
- Nome: `tarefas`
- Tipo: **Matriz**
- Valor: `[]`

## 3. Buscar buckets e tarefas
**+ Nova etapa > Planner > Listar buckets**
- Grupo: o grupo do plano · Plano: **Gestão de Contratos**

**+ Nova etapa > Planner > Listar tarefas**
- Grupo e Plano: os mesmos.
- Nos **...** da ação > **Configurações**: ative **Paginação** e coloque **Limite 5000**, se a opção aparecer.

## 4. Juntar as notas de cada tarefa
**+ Nova etapa > Aplicar a cada** (no designer novo, **Para cada**)
- Entrada: **value** de *Listar tarefas* (conteúdo dinâmico).

Dentro do laço:
1. **Planner > Obter detalhes da tarefa**: Id da tarefa = **Id** de *Listar tarefas*.
2. **Acrescentar à variável de matriz**: Nome `tarefas`. Em **Valor**, abra a aba **Expressão** e cole:
   ```
   addProperty(items('Aplicar_a_cada'), 'notas', body('Obter_detalhes_da_tarefa')?['description'])
   ```
   No designer novo o laço se chama `Para_cada`: troque `Aplicar_a_cada` por `Para_cada`. Se você renomear as ações, troque os nomes na expressão (espaços viram `_`).

## 5. Montar o arquivo
Fora do laço, **+ Nova etapa > Compor**. Em **Entradas**, aba **Expressão**:
```
setProperty(setProperty(setProperty(json('{}'), 'exportado_em', utcNow()), 'buckets', body('Listar_buckets')?['value']), 'tarefas', variables('tarefas'))
```

## 6. Salvar no SharePoint
**+ Nova etapa > SharePoint > Criar arquivo**
- Endereço do site: o site da **Intranet**.
- Caminho da pasta: a pasta **ROTINEIROS** (a mesma da venda diária).
- Nome do arquivo: `planner_contratos.json`
- Conteúdo do arquivo, aba **Expressão**: `string(outputs('Compor'))`

**Salvar** e **Testar > Manualmente**. Ao terminar, o arquivo aparece na pasta do SharePoint e, em alguns minutos, na pasta sincronizada do computador. Se o teste der erro dizendo que o arquivo já existe, troque a última ação por **SharePoint > Atualizar arquivo** apontando para ele.

## 7. Ligar no robô
No `config_robo.json` do computador:
```
"planner_json": "C:/Users/.../Intranet - ROTINEIROS/planner_contratos.json",
"planner": "C:/Users/.../Intranet - ROTINEIROS/GESTAO DE CONTRATOS.xlsx"
```
- `planner_json` é o arquivo do fluxo, e é dele que os contratos são importados.
- `planner` é uma exportação do Planner em Excel, usada **só uma vez** para o robô aprender qual rótulo é cada consultor (o Planner guarda os rótulos como "category1, category2…"). Depois da primeira importação, pode deixar `"planner": ""`.

Rode o `rodar_agora.bat`. No `importacao.log` devem aparecer duas linhas, uma com `Rótulos do Planner: category5=Frank, ...` e outra com `OK: Planner (fluxo): N contratos, M com consultor`.

Se um rótulo novo for criado no Planner (um consultor novo, por exemplo), exporte o plano de novo para o Excel, coloque o caminho em `planner` e rode `rodar_agora.bat` com `--calibrar` (ou apague o `estado_robo.json`).
