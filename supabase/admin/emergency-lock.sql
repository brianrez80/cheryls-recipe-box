-- Approval-only containment AFTER this security schema is installed.
-- Explicitly set recipebox.approved_lock='yes' in the operator session first.
-- Locks both accounts without changing recipes, images, history or RLS.
begin;
do $$ begin
  if current_user <> 'postgres' or coalesce(current_setting('recipebox.approved_lock',true),'') <> 'yes' then
    raise exception 'Operator approval is required for emergency account locking';
  end if;
end $$;
update recipe_private.authorized_users set enabled=false;
commit;
