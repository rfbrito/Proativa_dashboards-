-- =====================================================================
-- PAINÉIS "BASE DE CLIENTES" (cli) e "MESA DE PREÇOS" (mesa) — habilita os novos painéis no banco
-- Rode no SQL Editor do Supabase, depois do 01_schema.sql. Pode rodar de novo.
-- Cada consultor só enxerga as linhas dele (mesma regra dos outros painéis).
-- =====================================================================
alter table public.dados      drop constraint if exists dados_painel_check;
alter table public.dados      add  constraint dados_painel_check      check (painel in ('rec','hub','aba','cli'));
alter table public.dados_meta drop constraint if exists dados_meta_painel_check;
alter table public.dados_meta add  constraint dados_meta_painel_check check (painel in ('rec','hub','aba','cli'));

create or replace function public.admin_atualizar_usuario(
  p_id uuid, p_role text, p_ativo boolean, p_pessoas text[], p_paineis text[], p_nome text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare validos text[] := array['rec','hub','aba','cli','mesa','ger','sla','cart'];
begin
  if not public.eh_admin() then raise exception 'sem_permissao'; end if;
  if p_role not in ('pendente','atendente','gestor','admin') then raise exception 'papel_invalido'; end if;
  if p_id = auth.uid() and (p_role <> 'admin' or not p_ativo) then
    raise exception 'nao_pode_rebaixar_a_si_mesmo';
  end if;
  if exists (select 1 from unnest(coalesce(p_paineis,'{}')) x where x <> all (validos)) then
    raise exception 'painel_invalido';
  end if;
  update public.profiles set
    role    = p_role,
    ativo   = p_ativo,
    nome    = coalesce(nullif(btrim(p_nome),''), nome),
    pessoas = coalesce((select array_agg(distinct n) from (
                select split_part(public.norm_nome(x),' ',1) n from unnest(coalesce(p_pessoas,'{}')) x) s
                where n <> ''), '{}'),
    paineis = coalesce(p_paineis,'{}')
  where id = p_id;
end $$;
