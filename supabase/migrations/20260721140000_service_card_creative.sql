alter table public.services
  add column if not exists card_headline text,
  add column if not exists card_supporting_text text,
  add column if not exists card_style text;

alter table public.services
  drop constraint if exists services_card_style_check;

alter table public.services
  add constraint services_card_style_check
  check (card_style is null or card_style in ('bold', 'bottom', 'clean'));
