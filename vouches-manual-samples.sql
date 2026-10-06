-- =========================================
-- Manual vouch copy — natural slang, mixed games
-- Use: paste into Supabase SQL, or copy rows one-by-one.
-- Replace older rows: UPDATE vouches SET discord_username = '...', content = '...', rating = 5 WHERE id = <id>;
-- Or delete stale seed rows first, then INSERT below (change seed:... ids so they stay unique).
-- =========================================

-- Example UPDATEs (swap <id> for real ids from your table):
/*
UPDATE vouches SET discord_username = 'mara.94', rating = 5, content = 'paid at like 2am, key was in my inbox before I finished my drink. apex esp is clean af, not that rgb vomit some sellers push. fs worth it'
WHERE id = <id>;

UPDATE vouches SET discord_username = 'vinny_plays', rating = 5, content = 'rust wipe was frying me every week, this actually let me hold my own in fights without feeling like a bot. support answered in disc in under 10 mins when i borked my loader path'
WHERE id = <id>;
*/

-- Fresh INSERTs (unique discord_user_id each time you run — change UUIDs if re-running)
INSERT INTO vouches (discord_user_id, discord_username, avatar_url, rating, content, proof_url) VALUES
(
  'seed:manual-' || gen_random_uuid()::text,
  'mara.94',
  'https://i.pravatar.cc/256?u=mara94-vouch',
  5,
  'paid at like 2am, key was in my inbox before I finished my drink. apex esp is clean af, not that rgb vomit some sellers push. fs worth it',
  NULL
),
(
  'seed:manual-' || gen_random_uuid()::text,
  'vinny_plays',
  'https://i.pravatar.cc/256?u=vinny-plays-vouch',
  5,
  'rust wipe was frying me every week, this actually let me hold my own in fights without feeling like a bot. support answered in disc in under 10 mins when i borked my loader path',
  NULL
),
(
  'seed:manual-' || gen_random_uuid()::text,
  'soju.r6',
  'https://i.pravatar.cc/256?u=soju-r6-vouch',
  5,
  'siege info is readable at a glance, not a wall of junk on screen. been qing with the boys and nobody clocked anything weird — that was my biggest worry tbh',
  NULL
),
(
  'seed:manual-' || gen_random_uuid()::text,
  'tarkov.lev',
  'https://i.pravatar.cc/256?u=tarkov-lev-vouch',
  4,
  'tarkov stuff is always a gamble after patches but this build survived two updates for me. not perfect every raid obv but way less headache than last provider i used',
  NULL
),
(
  'seed:manual-' || gen_random_uuid()::text,
  'ny.jay',
  'https://i.pravatar.cc/256?u=ny-jay-vouch',
  5,
  'cod lobbies been brutal, aim felt sticky in a good way — like it helps you track without doing all the work for you. lowkey surprised how smooth it is on my mid pc',
  NULL
),
(
  'seed:manual-' || gen_random_uuid()::text,
  'hannah.w',
  'https://i.pravatar.cc/256?u=hannah-w-vouch',
  5,
  'valorant rankup was stuck in elo hell for a month, this got my crosshair placement feeling natural again. not talking about snapping across the map, just consistent duels',
  NULL
),
(
  'seed:manual-' || gen_random_uuid()::text,
  'dex.builds',
  'https://i.pravatar.cc/256?u=dex-builds-vouch',
  5,
  'fortnite builds + piece control still on me but my shotgun tags actually connect now. whole setup took like 15 mins, discord guide was straight to the point no fluff',
  NULL
),
(
  'seed:manual-' || gen_random_uuid()::text,
  'arc.raider',
  'https://i.pravatar.cc/256?u=arc-raider-vouch',
  5,
  'arc raiders esp is clutch for looting fast without running around blind. fps dip is tiny on my rig — was expecting worse ngl',
  NULL
),
(
  'seed:manual-' || gen_random_uuid()::text,
  'perm.spoof',
  'https://i.pravatar.cc/256?u=perm-spoof-vouch',
  5,
  'hwid sitch had me stressed, walked through the steps with support and got back in same day. no weird extra software pile, just what was needed',
  NULL
),
(
  'seed:manual-' || gen_random_uuid()::text,
  'kairo_',
  'https://i.pravatar.cc/256?u=kairo-vouch',
  4,
  'was skeptical bc every seller promises "undetected" but creed has been solid for my use case. if something looks off they actually post in disc instead of ghosting',
  NULL
);
