-- =====================================================================
-- 06_tudo_em_um.sql — RODE ESTE ARQUIVO NO SQL EDITOR DO SUPABASE (uma vez; pode repetir sem problema)
-- Corrige o erro: new row for relation "dados_meta" violates check constraint "dados_meta_painel_check"
-- Habilita a Base de Clientes ('cli') e o diagnóstico de usuários. Dispensa rodar o 04 e o 05 separados.
-- Pré-requisito: 01, 02 e 03 já rodados.
-- =====================================================================
alter table public.dados      drop constraint if exists dados_painel_check;
alter table public.dados_meta drop constraint if exists dados_meta_painel_check;
do $$
declare r record;
begin
  for r in select c.conrelid::regclass as t, c.conname
           from pg_constraint c
           where c.contype='c' and c.conrelid in ('public.dados'::regclass,'public.dados_meta'::regclass)
             and pg_get_constraintdef(c.oid) ilike '%painel%' loop
    execute format('alter table %s drop constraint %I', r.t, r.conname);
  end loop;
end $$;
alter table public.dados      add constraint dados_painel_check      check (painel in ('rec','hub','aba','cli'));
alter table public.dados_meta add constraint dados_meta_painel_check check (painel in ('rec','hub','aba','cli'));

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

create or replace function public.dados_diagnostico() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  select jsonb_build_object(
    -- nomes publicados nas planilhas, quantas linhas cada um tem e se algum usuário está vinculado
    'nomes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'painel', d.painel, 'pessoa', d.pessoa, 'linhas', d.n,
               'usuarios', coalesce((select string_agg(coalesce(p.nome,p.email), ', ')
                                     from profiles p where p.ativo and d.pessoa = any (p.pessoas)),'')
             ) order by d.painel, d.pessoa)
      from (select painel, pessoa, count(*) n from dados group by painel, pessoa) d), '[]'::jsonb),
    -- o que cada atendente enxerga de fato em cada painel
    'usuarios', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'nome', coalesce(p.nome,p.email), 'pessoas', p.pessoas, 'painel', x.painel,
               'linhas', (select count(*) from dados d where d.painel = x.painel and d.pessoa = any (p.pessoas)),
               'total', (select count(*) from dados d where d.painel = x.painel)
             ) order by p.nome, x.painel)
      from profiles p
      cross join lateral unnest(p.paineis) x(painel)
      where p.ativo and p.role = 'atendente' and x.painel in ('rec','hub','aba','cli')), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.dados_diagnostico() from public, anon;
grant execute on function public.dados_diagnostico() to authenticated;
select 'ok — banco pronto para a Base de Clientes' as resultado;
