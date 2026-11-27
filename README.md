# Painel de Atendimento GLP GÁS — Relatório Comercial

Painel multiusuário (shell + iframes) em HTML único, com Supabase (Auth + Postgres/RLS) e hospedagem estática (Netlify).
Perfis: admin, gestor, atendente, pendente. Abas do Relatório Comercial: Clientes (Base de Clientes), Carteira, Operação Diária, Base Mensal.

## Conteúdo
- `Painel_de_Atendimento_v39.html` — build final (contém URL e chave **anon** do Supabase; protegida por RLS).
- `supabase/` — SQLs `01` a `06` (rodar em ordem; `06_tudo_em_um.sql` cobre o painel `cli`) e guias de configuração.
- `src/` — fontes: `cli.html` (visualizador), `app.js` (shell/importador), `build.py`, `lightify.py`, `mk_release.py` e testes.

## Configuração
1. No Supabase, abra o SQL Editor e rode `supabase/01_schema.sql` … `06_tudo_em_um.sql`.
2. Crie o primeiro usuário, cadastre-se no painel e promova-o a `admin` na tabela `profiles`.
3. Publique `Painel_de_Atendimento_v39.html` no Netlify (arrastar e soltar ou via repositório).
4. Entre como admin, abra a Central de importação e envie as planilhas (vendas, relatório, Bases_Infos, carteiras).

Detalhes em `supabase/GUIA_CONFIGURACAO.md` e `supabase/GUIA_ROTA_AUTOMATICA.md`.

## Rebuild
`python3 src/build.py` (precisa de `node_modules` com `@supabase/supabase-js` e `xlsx`) e `python3 src/mk_release.py <saida.html>` para injetar URL/chave.

## Painel do Consultor (celular)
Projeto Supabase **próprio**, separado do Painel de Atendimento.
- `painel_consultor.html`: painel mobile. Login com criar conta e esqueci a senha, importação das planilhas (venda diária, carteiras .json, planner de contratos, RelFinCliente) e tela de usuários para o admin.
- `config.js`: URL e chave publishable do projeto Supabase do consultor.
- `supabase_consultor/01_banco_consultor.sql`: tabelas `perfis`, `clientes`, `vendas`, `contratos` e resumos; o consultor só lê a própria carteira (RLS).
- Passo a passo: `supabase_consultor/GUIA.md`.
- Endereço (GitHub Pages, branch `main`, pasta raiz): `https://rfbrito.github.io/Proativa_dashboards-/painel_consultor.html`.
