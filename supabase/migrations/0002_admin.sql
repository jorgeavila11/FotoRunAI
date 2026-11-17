-- =====================================================================
-- FotoRun AI — Tornar uma conta ADMINISTRADORA da plataforma
-- 1) Crie a conta normalmente pelo site (como fotógrafo) e confirme o e-mail.
-- 2) Troque o e-mail abaixo pelo da sua conta.
-- 3) Rode no Supabase: SQL Editor > New query > Run.
-- 4) No site, saia e entre de novo: o menu "Administração" aparece.
-- =====================================================================

update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'SEU-EMAIL@exemplo.com');

-- Confere quem é administrador:
select p.full_name, u.email, p.role
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin';
