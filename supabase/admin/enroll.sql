-- OPERATOR ONLY: run after explicit approval and both users verify their email.
-- Supply the exact UUIDs/emails privately with SET LOCAL recipebox.brian_id,
-- recipebox.brian_email, recipebox.cheryl_id, recipebox.cheryl_email in the
-- SAME transaction as this script. Never commit real enrollment values.
-- No accounts are created, confirmed, or modified by this script.
do $enrollment$
declare
  brian_id uuid := nullif(current_setting('recipebox.brian_id',true),'')::uuid;
  cheryl_id uuid := nullif(current_setting('recipebox.cheryl_id',true),'')::uuid;
  brian_email text := lower(btrim(current_setting('recipebox.brian_email',true)));
  cheryl_email text := lower(btrim(current_setting('recipebox.cheryl_email',true)));
begin
  if current_user <> 'postgres' then raise exception 'Enrollment requires the database operator'; end if;
  if brian_id is null or cheryl_id is null or brian_id=cheryl_id
     or coalesce(brian_email,'')='' or coalesce(cheryl_email,'')='' or brian_email=cheryl_email then
    raise exception 'Two distinct approved identities and exact verified emails are required';
  end if;
  if not exists(select 1 from auth.users where id=brian_id and lower(email)=brian_email
      and email_confirmed_at is not null and is_anonymous is not true and (banned_until is null or banned_until<=now()))
    or not exists(select 1 from auth.users where id=cheryl_id and lower(email)=cheryl_email
      and email_confirmed_at is not null and is_anonymous is not true and (banned_until is null or banned_until<=now())) then
    raise exception 'Enrollment does not match verified Auth identities';
  end if;
  if exists(select 1 from recipe_private.authorized_users
    where (seat='brian' and user_id<>brian_id) or (seat='cheryl' and user_id<>cheryl_id)) then
    raise exception 'A different identity already occupies a seat; investigate before changing it';
  end if;
  insert into recipe_private.authorized_users(seat,user_id)
    values ('brian',brian_id),('cheryl',cheryl_id) on conflict(seat) do nothing;
end;
$enrollment$;
