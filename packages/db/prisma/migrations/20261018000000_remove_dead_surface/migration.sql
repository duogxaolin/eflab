-- remove-dead-surface: drop the eight user-content tables that only the deleted
-- community / feed / tierList / user routers wrote to (openspec change
-- remove-dead-surface, 2026-10-18). User / Session / Account (auth) and the
-- Pack / PackCard / Manager data tables stay.
--
-- Hand-written from `prisma migrate diff --from-schema-datamodel <old>
-- --to-schema-datamodel <new> --script`, which emits 16 DROP CONSTRAINT + 8 DROP
-- TABLE statements. CASCADE drops those foreign keys (and the tables' own
-- indexes) in one statement each; IF EXISTS keeps the migration re-runnable on
-- a database where some of the tables are already gone. Nothing outside these
-- eight tables references them, so CASCADE cannot reach another table.
-- No enum is exclusive to these tables (Role is used by User, CardType by
-- Player), so no type is dropped.

-- Children first (Comment / PostLike reference Post), then the rest.
DROP TABLE IF EXISTS "Comment" CASCADE;
DROP TABLE IF EXISTS "PostLike" CASCADE;
DROP TABLE IF EXISTS "Post" CASCADE;
DROP TABLE IF EXISTS "Build" CASCADE;
DROP TABLE IF EXISTS "Review" CASCADE;
DROP TABLE IF EXISTS "TierVote" CASCADE;
DROP TABLE IF EXISTS "TierList" CASCADE;
DROP TABLE IF EXISTS "Follow" CASCADE;
