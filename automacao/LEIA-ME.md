# Robô da venda diária e do Planner

Leva a planilha **VENDA_POR_VENDEDOR_DIARIO.xlsx** (e, se você quiser, a exportação do Planner **Gestão de Contratos**) do SharePoint para o Supabase do Painel do Consultor, sem ninguém precisar importar no painel.
Ele roda num computador da empresa, de hora em hora, e só importa quando a planilha mudou.
Faz exatamente o que "Importar planilhas" faz no painel: troca as vendas do período do arquivo, cria clientes novos e preenche nomes que faltam. No Planner, troca todos os contratos pelos da planilha.

## Antes de começar

1. **Usuário do robô.** No painel, toque em **Criar conta** e cadastre um e-mail que vocês controlem (ex.: `robo.painel@...`). Confirme o e-mail. Depois, no menu **Usuários**, libere esse usuário como **Gestor**. O robô entra com ele, nunca com a chave secreta do Supabase.
2. **Pasta sincronizada.** No SharePoint, abra a pasta da planilha e clique em **Sincronizar**. No Explorador de Arquivos, clique com o botão direito na planilha e escolha **Sempre manter neste dispositivo**.
3. **Python.** Instale o Python 3 em https://www.python.org/downloads/ e marque **Add python.exe to PATH** na primeira tela.

## Instalação

1. Copie esta pasta `automacao` para um caminho curto, por exemplo `C:\GLP\robo`.
2. Dê dois cliques em **instalar.bat**.
3. O Bloco de Notas abre o `config_robo.json`. Preencha:
   - `email` e `senha`: do usuário robô.
   - `arquivo`: o caminho da planilha de venda diária. Para pegar, segure **Shift**, clique com o botão direito na planilha e escolha **Copiar como caminho**. Cole e troque cada `\` por `/` e tire as aspas extras.
   - `planner` (opcional): o caminho da planilha exportada do Planner, do mesmo jeito. Se não for usar, deixe `"planner": ""`.
4. Salve e feche. O instalador testa a leitura da planilha e cria a tarefa agendada **GLP - Venda diaria**.
5. Para importar na hora, dê dois cliques em **rodar_agora.bat**.

## Planner

Há dois jeitos:
- **Automático (recomendado):** um fluxo gratuito do Power Automate grava o arquivo `planner_contratos.json` todo dia na pasta do SharePoint. O passo a passo está em **FLUXO-PLANNER.md**. No `config_robo.json`, preencha `planner_json` com o caminho desse arquivo.
- **Manual:** no Planner, abra o plano **Gestão de Contratos** > **...** > **Exportar plano para o Excel** e salve o arquivo sempre com o mesmo nome, na pasta sincronizada, substituindo o anterior. Preencha `planner` com esse caminho.

## No dia a dia

- O computador precisa estar ligado e com o usuário logado (o OneDrive só sincroniza assim).
- O histórico fica em `importacao.log`, na mesma pasta. Cada importação aparece como `OK: ... notas de ... a ...`.
- Se der erro (sem internet, senha trocada), a próxima hora tenta de novo.
- Para parar o robô, rode **desinstalar.bat**.

O `config_robo.json` guarda a senha do usuário robô: deixe a pasta só para quem usa esse computador e não envie esse arquivo para ninguém.
