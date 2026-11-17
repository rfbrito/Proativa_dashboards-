-- Libera a "Mesa de Preços" (e o Relatório Comercial) para quem já tem acesso ao painel.
-- Rode no SQL Editor do Supabase. Só mexe na coluna profiles.paineis (não apaga nada).

-- 1) Quem tem o perfil mas não enxerga a Mesa de Preços (conferir antes):
select email, nome, role, ativo, paineis from public.profiles order by role, email;

-- 2) Libera a Mesa de Preços para TODOS os gestores ativos (ex.: Daniel Figueiredo):
update public.profiles
   set paineis = array(select distinct unnest(coalesce(paineis,'{}') || array['mesa']))
 where ativo and role = 'gestor';

-- 3) (Opcional) Libera também para atendentes ativos:
-- update public.profiles
--    set paineis = array(select distinct unnest(coalesce(paineis,'{}') || array['mesa']))
--  where ativo and role = 'atendente';

-- 4) (Opcional) Um usuário específico:
-- update public.profiles
--    set paineis = array(select distinct unnest(coalesce(paineis,'{}') || array['mesa']))
--  where email = 'email.do.usuario@empresa.com';
