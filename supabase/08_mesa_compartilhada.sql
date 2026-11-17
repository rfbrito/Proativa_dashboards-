-- Mesa de Preços compartilhada: pedidos, configurações e base ficam no Supabase,
-- e todos com o painel "mesa" (admin, gestores, atendentes liberados) enxergam os mesmos cards.
-- Rode no SQL Editor do Supabase (depois do 07_liberar_mesa.sql).
create table if not exists public.mesa_estado (
  chave          text primary key check (chave in ('pedidos','cfg','base')),
  valor          jsonb not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);
alter table public.mesa_estado enable row level security;

create or replace function public.pode_mesa() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.ativo
                   and (p.role = 'admin' or 'mesa' = any (p.paineis)));
$$;

drop policy if exists mesa_sel on public.mesa_estado;
drop policy if exists mesa_ins on public.mesa_estado;
drop policy if exists mesa_upd on public.mesa_estado;
create policy mesa_sel on public.mesa_estado for select to authenticated using (public.pode_mesa());
create policy mesa_ins on public.mesa_estado for insert to authenticated with check (public.pode_mesa());
create policy mesa_upd on public.mesa_estado for update to authenticated using (public.pode_mesa()) with check (public.pode_mesa());
