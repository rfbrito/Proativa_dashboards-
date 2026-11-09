-- =====================================================================
-- PAINÉIS GLP · Proativa — esquema de usuários, papéis e dados por pessoa
-- Cole TODO este arquivo no Supabase: SQL Editor > New query > Run
-- Pode rodar de novo sem problema (é idempotente).
-- =====================================================================

-- ---------- configuração (ninguém acessa pela API; só você, pelo SQL) ----------
create table if not exists public.config (
  chave text primary key,
  valor text not null
);
alter table public.config enable row level security;   -- sem policy = fechado

-- ---------- utilitário: normaliza nome (sem acento, maiúsculo) ----------
create or replace function public.norm_nome(t text) returns text
language sql immutable as $$
  select upper(btrim(translate(coalesce(t,''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')))
$$;

-- ---------- perfis ----------
create table if not exists public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text not null,
  nome      text,
  role      text not null default 'pendente'
            check (role in ('pendente','atendente','gestor','admin')),
  ativo     boolean not null default false,
  pessoas   text[] not null default '{}',   -- nomes que identificam a pessoa nas planilhas (1º nome)
  paineis   text[] not null default '{}',   -- rec, hub, aba, ger, sla, cart
  criado_em timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ---------- funções auxiliares (security definer evita recursão de RLS) ----------
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin' and ativo)
$$;

create or replace function public.pode_gravar(p_painel text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and ativo
                   and (role = 'admin' or (role = 'gestor' and p_painel = any(paineis))))
$$;

-- ---------- novo cadastro -> perfil "pendente" ----------
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare dom text;
begin
  select valor into dom from public.config where chave = 'dominio_email';
  if dom is not null and lower(new.email) not like '%@' || lower(dom) then
    raise exception 'email_nao_autorizado';
  end if;
  insert into public.profiles (id, email, nome)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)));
  return new;
end $$;

drop trigger if exists trg_novo_usuario on auth.users;
create trigger trg_novo_usuario after insert on auth.users
  for each row execute function public.novo_usuario();

-- ---------- policies de profiles: cada um vê só o seu; admin vê todos ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.eh_admin());
-- (sem policy de insert/update/delete: só as funções abaixo alteram perfis)

-- ---------- admin altera usuário ----------
create or replace function public.admin_atualizar_usuario(
  p_id uuid, p_role text, p_ativo boolean, p_pessoas text[], p_paineis text[], p_nome text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare validos text[] := array['rec','hub','aba','ger','sla','cart'];
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

-- ---------- dados das planilhas (Recuperação, Hub, Abastecimento) ----------
create table if not exists public.dados (
  id     bigint generated always as identity primary key,
  painel text not null check (painel in ('rec','hub','aba')),
  aba    text not null,                 -- nome da aba da planilha
  ordem  int  not null,
  pessoa text,                          -- 1º nome normalizado (null = linha sem responsável)
  linha  jsonb not null                 -- valores da linha, na ordem do cabeçalho
);
create index if not exists dados_painel_aba_ordem on public.dados (painel, aba, ordem);
create index if not exists dados_painel_pessoa    on public.dados (painel, pessoa);
alter table public.dados enable row level security;

create table if not exists public.dados_meta (
  painel      text not null check (painel in ('rec','hub','aba')),
  aba         text not null,
  cabecalho   jsonb not null,
  fmt         jsonb,
  arquivo     text,
  enviado_por uuid,
  enviado_em  timestamptz not null default now(),
  primary key (painel, aba)
);
alter table public.dados_meta enable row level security;

drop policy if exists dados_select on public.dados;
create policy dados_select on public.dados for select to authenticated using (
  public.eh_admin()
  or exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.ativo and dados.painel = any (p.paineis)
               and (p.role = 'gestor'
                    or (p.role = 'atendente' and dados.pessoa is not null and dados.pessoa = any (p.pessoas))))
);

drop policy if exists dados_meta_select on public.dados_meta;
create policy dados_meta_select on public.dados_meta for select to authenticated using (
  public.eh_admin()
  or exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.ativo and dados_meta.painel = any (p.paineis))
);

-- ---------- envio de planilha (admin, ou gestor com acesso ao painel) ----------
drop function if exists public.dados_iniciar(text);
create or replace function public.dados_iniciar(p_painel text, p_prefixo text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_gravar(p_painel) then raise exception 'sem_permissao'; end if;
  delete from public.dados      where painel = p_painel and left(aba, length(p_prefixo)) = p_prefixo;
  delete from public.dados_meta where painel = p_painel and left(aba, length(p_prefixo)) = p_prefixo;
end $$;

create or replace function public.dados_inserir(p_painel text, p_aba text, p_inicio int, p_linhas jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.pode_gravar(p_painel) then raise exception 'sem_permissao'; end if;
  insert into public.dados (painel, aba, ordem, pessoa, linha)
  select p_painel, p_aba, p_inicio + (t.i - 1)::int,
         nullif(split_part(public.norm_nome(t.e->>'p'),' ',1), ''),
         t.e->'l'
  from jsonb_array_elements(p_linhas) with ordinality as t(e, i);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.dados_meta_salvar(p_painel text, p_aba text, p_cabecalho jsonb, p_fmt jsonb, p_arquivo text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_gravar(p_painel) then raise exception 'sem_permissao'; end if;
  insert into public.dados_meta (painel, aba, cabecalho, fmt, arquivo, enviado_por)
  values (p_painel, p_aba, p_cabecalho, p_fmt, p_arquivo, auth.uid())
  on conflict (painel, aba) do update set cabecalho = excluded.cabecalho, fmt = excluded.fmt,
    arquivo = excluded.arquivo, enviado_por = excluded.enviado_por, enviado_em = now();
end $$;

-- ---------- permissões de acesso à API ----------
revoke all on public.profiles, public.dados, public.dados_meta, public.config from anon, authenticated;
grant select on public.profiles, public.dados, public.dados_meta to authenticated;
revoke all on function public.admin_atualizar_usuario(uuid,text,boolean,text[],text[],text) from public, anon;
revoke all on function public.dados_iniciar(text,text) from public, anon;
revoke all on function public.dados_inserir(text,text,int,jsonb) from public, anon;
revoke all on function public.dados_meta_salvar(text,text,jsonb,jsonb,text) from public, anon;
grant execute on function public.admin_atualizar_usuario(uuid,text,boolean,text[],text[],text) to authenticated;
grant execute on function public.dados_iniciar(text,text) to authenticated;
grant execute on function public.dados_inserir(text,text,int,jsonb) to authenticated;
grant execute on function public.dados_meta_salvar(text,text,jsonb,jsonb,text) to authenticated;
