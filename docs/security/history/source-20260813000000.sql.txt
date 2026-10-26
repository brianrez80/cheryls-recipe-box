-- Optional external links for the legacy Recipe Box flow.
-- Additive and safe for recipes created before link support existed.
alter table public.recipes
  add column if not exists video_url text,
  add column if not exists source_url text;

comment on column public.recipes.video_url is
  'Optional HTTP(S) recipe video URL; only supported YouTube URLs are embedded by the client.';
comment on column public.recipes.source_url is
  'Optional HTTP(S) original recipe webpage URL.';
