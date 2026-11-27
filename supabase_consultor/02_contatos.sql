-- =====================================================================
-- PAINEL DO CONSULTOR GLP — contatos do alerta "Sem consumo no mês"
-- Rode no SQL Editor depois do 01_banco_consultor.sql. Pode rodar de novo (idempotente).
-- Consultor: vê e grava só contatos de clientes da carteira dele. Gestor/admin: veem e corrigem todos.
-- =====================================================================

create table if not exists public.contatos (
  id         bigint generated always as identity primary key,
  cliente    text not null,
  consultor  text,
  data       date not null default current_date,
  nota       text check (char_length(nota) <= 1000),
  autor      uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em  timestamptz not null default now()
);
create index if not exists contatos_cli_data on public.contatos (cliente, data);
alter table public.contatos enable row level security;

drop policy if exists contatos_ler on public.contatos;
create policy contatos_ler on public.contatos for select to authenticated
  using (public.eh_gestor() or upper(consultor) = public.meu_consultor());

drop policy if exists contatos_incluir on public.contatos;
create policy contatos_incluir on public.contatos for insert to authenticated
  with check (
    public.eh_gestor()
    or (upper(consultor) = public.meu_consultor() and autor = auth.uid()
        and exists (select 1 from public.clientes c where c.codigo = contatos.cliente and upper(c.consultor) = public.meu_consultor()))
  );

drop policy if exists contatos_alterar on public.contatos;
create policy contatos_alterar on public.contatos for update to authenticated
  using (public.eh_gestor() or (autor = auth.uid() and upper(consultor) = public.meu_consultor()))
  with check (public.eh_gestor() or (autor = auth.uid() and upper(consultor) = public.meu_consultor()));

drop policy if exists contatos_apagar on public.contatos;
create policy contatos_apagar on public.contatos for delete to authenticated
  using (public.eh_gestor() or (autor = auth.uid() and upper(consultor) = public.meu_consultor()));

revoke all on public.contatos from anon;
grant select, insert, update, delete on public.contatos to authenticated;

select 'ok — contatos prontos' as resultado;
