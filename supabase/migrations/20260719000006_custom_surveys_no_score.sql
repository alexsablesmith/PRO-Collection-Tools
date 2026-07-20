-- ─────────────────────────────────────────────────────────────────────────────
-- Custom surveys: no composite score
--
-- Custom surveys are assembled from item-bank questions that come from
-- differently-scored instruments, so a summed total is meaningless. The app
-- now creates them with scoring_config {"type": "none"} (item-level
-- responses only); this flips any custom surveys created before the change.
-- ─────────────────────────────────────────────────────────────────────────────

update public.instruments
   set scoring_config = '{"type": "none"}'::jsonb
 where code like 'custom\_%' escape '\';
