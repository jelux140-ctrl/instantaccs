/* GET public reviews list (newest first) + summary stats.
   Table is still named `vouches`; the site presents them as "Reviews". */

import { createClient } from '@supabase/supabase-js';

const getSupabase = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');
    return createClient(supabaseUrl, supabaseKey);
};

// discord_user_id is fetched only to tell seeded rows from genuine ones. It is
// never returned to the client — these are real Discord account ids.
const BASE_COLUMNS = 'id, discord_user_id, discord_username, avatar_url, rating, content, proof_url, created_at';
const EXTRA_COLUMNS = 'product, product_variant, product_short, staff_reply, staff_reply_at, verified_purchase';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
        const supabase = getSupabase();

        // The extra columns only exist once reviews-upgrade.sql has been run,
        // so fall back to the base set if they're missing.
        let { data, error } = await supabase
            .from('vouches')
            .select(`${BASE_COLUMNS}, ${EXTRA_COLUMNS}`)
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) {
            ({ data, error } = await supabase
                .from('vouches')
                .select(BASE_COLUMNS)
                .order('created_at', { ascending: false })
                .limit(500));
        }

        if (error) {
            console.error('reviews fetch error:', error);
            return res.status(500).json({ error: 'Failed to load reviews', details: error.message });
        }

        /* Strictly newest-first, by date alone.
           Pinning genuine reviews above seeded ones was tried and reverted: it
           parked a review from a month earlier at the top of the page, which
           reads as stale. A freshly posted review is the newest row and lands
           on top on its own. */
        const rows = (data || []).slice().sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );

        const reviews = rows.map((row) => ({
            id: row.id,
            discordUsername: row.discord_username,
            avatarUrl: row.avatar_url,
            rating: row.rating,
            content: row.content,
            proofUrl: row.proof_url,
            createdAt: row.created_at,
            product: row.product || null,
            productVariant: row.product_variant || null,
            productShort: row.product_short || null,
            staffReply: row.staff_reply || null,
            staffReplyAt: row.staff_reply_at || null,
            verifiedPurchase: row.verified_purchase !== false,
        }));

        const listed = reviews.length;
        const ratingSum = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0);
        const repliesListed = reviews.filter((r) => r.staffReply).length;

        /* Table-wide counts, not just the rendered batch.
           The grid only fetches the newest 500 rows, so counting those would
           under-report. Falls back to the batch if either count query fails
           (the staff_reply column only exists after reviews-upgrade.sql). */
        let totalRows = reviews.length;
        let replyRows = repliesListed;

        const totalRes = await supabase
            .from('vouches')
            .select('id', { count: 'exact', head: true });
        if (!totalRes.error && Number.isFinite(totalRes.count)) totalRows = totalRes.count;

        const replyRes = await supabase
            .from('vouches')
            .select('id', { count: 'exact', head: true })
            .not('staff_reply', 'is', null);
        if (!replyRes.error && Number.isFinite(replyRes.count)) replyRows = replyRes.count;

        /* Headline figures = live count + a fixed baseline offset.
           These were previously floors (`Math.max(1143, listed)`), which meant
           they sat frozen at 1143 and 226 no matter how many people vouched or
           how many replies support posted — nothing could move them until the
           real counts passed the floor. The offsets below were derived when the
           table held 132 rows and 28 replies, so the public numbers are
           unchanged today but now advance by one for every new review and every
           new support reply. */
        const TOTAL_OFFSET = parseInt(process.env.REVIEWS_COUNT_OFFSET || '1011', 10);
        const REPLIES_OFFSET = parseInt(process.env.REVIEWS_REPLIES_OFFSET || '198', 10);

        const stats = {
            total: totalRows + TOTAL_OFFSET,
            average: listed ? Number((ratingSum / listed).toFixed(1)) : 0,
            supportReplies: replyRows + REPLIES_OFFSET,
            fiveStar: reviews.filter((r) => Number(r.rating) === 5).length,
            listed,
        };

        // `vouches` kept for backwards compatibility with any older client.
        return res.status(200).json({ reviews, vouches: reviews, stats });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Failed to load reviews', message: e.message });
    }
}
