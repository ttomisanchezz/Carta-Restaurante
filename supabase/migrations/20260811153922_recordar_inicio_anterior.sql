-- `auth.users.last_sign_in_at` se pisa durante el login actual. Guardar el valor OLD en
-- el perfil permite decidir, despues de autenticar, cuanto paso desde el ingreso anterior
-- sin llevar la service role al runtime de Next ni depender del navegador del usuario.

alter table public.profiles
  add column previous_sign_in_at timestamptz;

create or replace function public.remember_previous_sign_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set previous_sign_in_at = old.last_sign_in_at
  where id = new.id;

  return new;
end;
$$;

revoke all on function public.remember_previous_sign_in() from public, anon, authenticated;

create trigger trg_auth_users_previous_sign_in
  after update of last_sign_in_at on auth.users
  for each row
  when (old.last_sign_in_at is distinct from new.last_sign_in_at)
  execute function public.remember_previous_sign_in();

notify pgrst, 'reload schema';
