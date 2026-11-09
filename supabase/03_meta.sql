-- =====================================================================
-- META DO PAINEL DE RECUPERAÇÃO — única para todos, só gestor/admin altera
-- Rode no SQL Editor do Supabase (depois do 01_schema.sql). Pode rodar de novo.
-- =====================================================================
insert into public.config (chave, valor) values ('meta_rec', '58')
on conflict (chave) do nothing;

-- qualquer usuário liberado lê a meta
create or replace function public.meta_obter() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select valor::numeric from public.config where chave = 'meta_rec'), 58)
  where exists (select 1 from public.profiles where id = auth.uid() and ativo)
$$;

-- só admin ou gestor com acesso à Recuperação altera
create or replace function public.meta_salvar(p_valor numeric) returns numeric
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_gravar('rec') then
    raise exception 'Sem permissão para alterar a meta.' using errcode = '42501';
  end if;
  if p_valor is null or p_valor < 0 or p_valor > 100 then
    raise exception 'A meta deve ficar entre 0 e 100.';
  end if;
  insert into public.config (chave, valor) values ('meta_rec', p_valor::text)
  on conflict (chave) do update set valor = excluded.valor;
  return p_valor;
end $$;

revoke all on function public.meta_obter() from public, anon;
revoke all on function public.meta_salvar(numeric) from public, anon;
grant execute on function public.meta_obter() to authenticated;
grant execute on function public.meta_salvar(numeric) to authenticated;
