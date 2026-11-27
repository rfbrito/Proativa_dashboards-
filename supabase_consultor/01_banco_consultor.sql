-- =====================================================================
-- PAINEL DO CONSULTOR GLP — banco novo (projeto Supabase próprio)
-- RASCUNHO v0 — rode inteiro no SQL Editor de um projeto NOVO. Pode rodar de novo (idempotente).
-- Regra principal: consultor só enxerga as linhas com o nome dele; gestor e admin veem tudo.
-- =====================================================================

-- ---------- perfis ----------
create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  nome       text,
  papel      text not null default 'pendente' check (papel in ('pendente','consultor','gestor','admin')),
  consultor  text,                       -- nome do consultor nas planilhas: FRANK, MAURO, PEDRA...
  ativo      boolean not null default false,
  criado_em  timestamptz not null default now()
);
alter table public.perfis enable row level security;

create or replace function public.eh_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo and papel in ('gestor','admin'))
$$;

create or replace function public.meu_consultor() returns text
language sql stable security definer set search_path = public as $$
  select upper(consultor) from perfis where id = auth.uid() and ativo and papel = 'consultor'
$$;

create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, email, nome)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists trg_novo_usuario on auth.users;
create trigger trg_novo_usuario after insert on auth.users for each row execute function public.novo_usuario();

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated using (id = auth.uid() or public.eh_gestor());

-- admin libera/altera usuários
create or replace function public.admin_definir_usuario(p_id uuid, p_papel text, p_consultor text, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis where id = auth.uid() and ativo and papel = 'admin') then raise exception 'sem_permissao'; end if;
  if p_id = auth.uid() and (p_papel <> 'admin' or not p_ativo) then raise exception 'nao_pode_rebaixar_a_si_mesmo'; end if;
  update perfis set papel = p_papel, consultor = nullif(upper(btrim(p_consultor)),''), ativo = p_ativo where id = p_id;
end $$;

-- ---------- clientes (carteira) ----------
create table if not exists public.clientes (
  codigo          text primary key,          -- 6 dígitos
  nome            text,
  fantasia        text,
  municipio       text,
  uf              text,
  consultor       text,                      -- FRANK, MAURO...
  status          text,
  primeira_compra date,
  ultima_compra   date,
  previsao_kg     numeric default 0,         -- consumo previsto por mês
  preco_tabela    numeric,
  tanque_cliente  boolean not null default false,  -- tanque é do cliente (não recolher)
  cadastrado_em   date default current_date,
  atualizado_em   timestamptz default now()
);

-- ---------- vendas (linhas de nota fiscal da planilha de venda diária, aba BASE) ----------
create table if not exists public.vendas (
  id         bigint generated always as identity primary key,
  cliente    text not null,
  emissao    date not null,
  nf         text not null,
  serie      text,
  kg         numeric not null default 0,
  valor      numeric not null default 0,
  consultor  text,
  unique (cliente, emissao, nf, serie)
);
create index if not exists vendas_cons_data on public.vendas (consultor, emissao);

-- ---------- contratos (planner Gestão de Contratos) ----------
create table if not exists public.contratos (
  id          text primary key,              -- Identificação da tarefa do Planner
  nome        text,
  etapa       text,
  status      text,
  tipo        text,                          -- Novo / Troca de ponto
  consultor   text,
  criado      date,
  inicio      date,
  prazo       date,
  concluido   date,
  preco       numeric,
  kg          numeric,
  cliente     text,
  atrasado    boolean default false
);

-- ---------- regras de acesso (iguais nas três tabelas) ----------
do $$
declare t text;
begin
  foreach t in array array['clientes','vendas','contratos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_ler', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.eh_gestor() or upper(consultor) = public.meu_consultor())', t||'_ler', t);
    execute format('drop policy if exists %I on public.%I', t||'_gravar', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.eh_gestor()) with check (public.eh_gestor())', t||'_gravar', t);
  end loop;
end $$;

revoke all on public.perfis, public.clientes, public.vendas, public.contratos from anon;
grant select on public.perfis to authenticated;
grant select, insert, update, delete on public.clientes, public.vendas, public.contratos to authenticated;
revoke all on function public.admin_definir_usuario(uuid,text,text,boolean) from public, anon;
grant execute on function public.admin_definir_usuario(uuid,text,text,boolean) to authenticated;

select 'ok — banco do Painel do Consultor pronto' as resultado;

-- ---------- resumos usados pelo painel (respeitam as mesmas regras de acesso) ----------
create or replace view public.vendas_mes with (security_invoker = true) as
  select cliente, to_char(emissao, 'YYYY-MM') as mes, max(consultor) as consultor,
         sum(kg) as kg, sum(valor) as valor, count(distinct nf) as nfs, max(emissao) as ultima
    from public.vendas group by cliente, to_char(emissao, 'YYYY-MM');

create or replace view public.vendas_dia with (security_invoker = true) as
  select emissao, consultor, sum(kg) as kg, sum(valor) as valor, count(distinct nf) as nfs
    from public.vendas group by emissao, consultor;

grant select on public.vendas_mes, public.vendas_dia to authenticated;
revoke all on public.vendas_mes, public.vendas_dia from anon;
select 'ok — resumos criados' as resultado;
