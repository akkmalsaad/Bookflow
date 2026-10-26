-- Settings > Help & feedback > Send feedback.
--
-- The feedback sheet writes to the existing public.user_feedback inbox
-- (see 20260915000000_create_support_requests_and_user_feedback.sql). Access control is unchanged:
-- insert-only for the signed-in owner, no SELECT, UPDATE or DELETE from the app.
--
--   * Two new categories, 'suggestion' and 'problem'. The original values stay valid so builds
--     already in people's hands keep working.
--   * contact_allowed: the sheet's "You can contact me about this feedback." checkbox. It defaults
--     to false, so a row that says nothing (including every older build's) means do not contact.
--     The team may look up the account's email from user_id only when this is true.

alter table public.user_feedback drop constraint if exists user_feedback_category_check;
alter table public.user_feedback add constraint user_feedback_category_check
  check (category in ('feature_request', 'improvement', 'praise', 'other', 'suggestion', 'problem'));

alter table public.user_feedback
  add column if not exists contact_allowed boolean not null default false;

grant insert (contact_allowed) on table public.user_feedback to authenticated;

comment on column public.user_feedback.contact_allowed is
  'True only when the person ticked "You can contact me about this feedback." Do not contact them otherwise.';
