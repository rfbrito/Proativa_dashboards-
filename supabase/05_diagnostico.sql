-- 05_diagnostico.sql — diagnóstico de "atendente não vê dados"
-- Rode no SQL Editor do Supabase (pode rodar mais de uma vez).
-- Só administradores conseguem chamar.

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
