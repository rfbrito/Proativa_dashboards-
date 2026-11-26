-- Hub de Desempenho: atendentes passam a ver os dados de TODA a equipe (para comparar equipe x individual).
-- Antes, cada atendente só recebia as próprias linhas, então "Equipe" e "individual" mostravam o mesmo número.
-- Os demais painéis continuam individuais (Recuperação, Abastecimento etc.).
-- Rode no SQL Editor do Supabase.
drop policy if exists dados_select on public.dados;
create policy dados_select on public.dados for select to authenticated using (
  public.eh_admin()
  or exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.ativo and dados.painel = any (p.paineis)
               and (p.role = 'gestor'
                    or (p.role = 'atendente'
                        and (dados.painel = 'hub'
                             or (dados.pessoa is not null and dados.pessoa = any (p.pessoas))))))
);
