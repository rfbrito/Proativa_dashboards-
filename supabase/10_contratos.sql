-- =====================================================================
-- 10_contratos.sql — planner "Gestão de Contratos" no Painel do Consultor
-- Rode no SQL Editor do Supabase (depois do 09_hub_equipe_para_atendentes.sql). Pode rodar de novo sem problema.
--
-- O que faz:
--  * cria o "painel" de dados 'ctr' (contratos), separado do 'cli' para que a
--    importação diária do Relatório Comercial não apague os contratos;
--  * quem tem o Relatório Comercial ('cli') liberado enxerga os contratos,
--    e o consultor (atendente) recebe SÓ os contratos com o nome dele (RLS no banco);
--  * admin e gestores com o Relatório Comercial podem publicar o planner.
-- =====================================================================

-- 1) aceitar o painel 'ctr' nas tabelas de dados
alter table public.dados      drop constraint if exists dados_painel_check;
alter table public.dados_meta drop constraint if exists dados_meta_painel_check;
alter table public.dados      add constraint dados_painel_check      check (painel in ('rec','hub','aba','cli','ctr'));
alter table public.dados_meta add constraint dados_meta_painel_check check (painel in ('rec','hub','aba','cli','ctr'));

-- 2) quem pode publicar: admin, ou gestor com o painel (para 'ctr', basta ter o 'cli')
create or replace function public.pode_gravar(p_painel text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and ativo
                   and (role = 'admin'
                        or (role = 'gestor' and (p_painel = any(paineis)
                                                 or (p_painel = 'ctr' and 'cli' = any(paineis))))))
$$;

-- 3) leitura: igual aos outros painéis; 'ctr' segue a liberação do 'cli'
drop policy if exists dados_select on public.dados;
create policy dados_select on public.dados for select to authenticated using (
  public.eh_admin()
  or exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.ativo
               and (dados.painel = any (p.paineis) or (dados.painel = 'ctr' and 'cli' = any (p.paineis)))
               and (p.role = 'gestor'
                    or (p.role = 'atendente'
                        and (dados.painel = 'hub'   -- mantém a regra do 09: Hub mostra a equipe toda
                             or (dados.pessoa is not null and dados.pessoa = any (p.pessoas))))))
);

drop policy if exists dados_meta_select on public.dados_meta;
create policy dados_meta_select on public.dados_meta for select to authenticated using (
  public.eh_admin()
  or exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.ativo
               and (dados_meta.painel = any (p.paineis) or (dados_meta.painel = 'ctr' and 'cli' = any (p.paineis))))
);

select 'ok — contratos (ctr) habilitados' as resultado;
