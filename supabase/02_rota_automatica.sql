-- =====================================================================
-- ATUALIZAÇÃO AUTOMÁTICA DA COBRANÇA DE ROTA (SharePoint -> Power Automate -> site)
-- Rode no SQL Editor do Supabase DEPOIS do 01_schema.sql.
-- Só quem tem o "segredo" consegue chamar a função. O segredo fica só no seu fluxo.
-- =====================================================================

-- 1) Gera o segredo (rode UMA vez; para trocar depois, rode de novo e atualize o fluxo)
insert into public.config (chave, valor)
values ('segredo_rota', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (chave) do nothing;
-- Para VER o segredo e copiá-lo para o Power Automate, rode:
--   select valor from public.config where chave = 'segredo_rota';

-- 2) Função chamada pelo Power Automate
create or replace function public.rota_publicar(
  p_segredo text, p_colunas jsonb, p_linhas jsonb, p_arquivo text default 'Cobrança de Rota'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  seg text; n int; ncol int; i_resp int; i_cod int; i_data int; cab jsonb; fmt jsonb;
begin
  select valor into seg from public.config where chave = 'segredo_rota';
  if seg is null or p_segredo is distinct from seg then raise exception 'nao_autorizado'; end if;
  if jsonb_typeof(p_colunas) <> 'array' or jsonb_typeof(p_linhas) <> 'array' then raise exception 'formato_invalido'; end if;
  ncol := jsonb_array_length(p_colunas);
  select (ord - 1)::int into i_resp from jsonb_array_elements_text(p_colunas) with ordinality t(c, ord) where public.norm_nome(c) like '%RESPONS%' order by ord limit 1;
  select (ord - 1)::int into i_cod  from jsonb_array_elements_text(p_colunas) with ordinality t(c, ord) where public.norm_nome(c) like '%COD%' order by ord limit 1;
  select (ord - 1)::int into i_data from jsonb_array_elements_text(p_colunas) with ordinality t(c, ord) where public.norm_nome(c) = 'DATA' order by ord limit 1;
  if i_resp is null or i_cod is null or i_data is null then raise exception 'faltam_colunas_data_codigo_responsavel'; end if;
  cab := p_colunas;
  fmt := (select jsonb_agg(case when (ord - 1)::int = i_data then 'dd/mm/yyyy' else null end order by ord)
          from jsonb_array_elements_text(p_colunas) with ordinality t(c, ord));

  -- monta as linhas (aceita data como número do Excel ou texto ISO "2026-10-20T00:00:00")
  create temp table _rota on commit drop as
  select o.ord::int as ordem,
         (select jsonb_agg(
            case when (c.ord - 1)::int = i_data
                      and jsonb_typeof(o.obj -> c.col) = 'string'
                      and (o.obj ->> c.col) ~ '^\d{4}-\d{2}-\d{2}'
                 then to_jsonb(((left(o.obj ->> c.col, 10))::date - date '1899-12-30'))
                 else o.obj -> c.col end
            order by c.ord)
          from jsonb_array_elements_text(p_colunas) with ordinality c(col, ord)) as linha
  from jsonb_array_elements(p_linhas) with ordinality o(obj, ord)
  where jsonb_typeof(o.obj) = 'object';
  delete from _rota where linha is null or not exists (select 1 from jsonb_array_elements(linha) e where e <> 'null'::jsonb and e <> '""'::jsonb);
  delete from _rota where (linha -> i_data) is null or (linha -> i_data) = 'null'::jsonb;   -- linha sem data não entra
  select count(*) into n from _rota;
  if n = 0 then raise exception 'nenhuma_linha_valida'; end if;

  -- substitui a rota publicada
  delete from public.dados      where painel = 'rec' and left(aba, 5) = 'rota:';
  delete from public.dados_meta where painel = 'rec' and left(aba, 5) = 'rota:';
  insert into public.dados (painel, aba, ordem, pessoa, linha)
  select 'rec', 'rota:Rota', ordem,
         nullif(split_part(public.norm_nome(linha ->> i_resp), ' ', 1), ''), linha from _rota;
  insert into public.dados_meta (painel, aba, cabecalho, fmt, arquivo)
  values ('rec', 'rota:Rota', cab, fmt, p_arquivo || ' (automático)');

  -- o painel não usa mais o FINA740: limpa baixas antigas, se houver
  delete from public.dados      where painel = 'rec' and aba = 'baixa';
  delete from public.dados_meta where painel = 'rec' and aba = 'baixa';
  return jsonb_build_object('ok', true, 'linhas', n, 'rota', 'publicada');
end $$;

revoke all on function public.rota_publicar(text, jsonb, jsonb, text) from public;
grant execute on function public.rota_publicar(text, jsonb, jsonb, text) to anon, authenticated;
