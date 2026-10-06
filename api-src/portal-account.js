/* Verified Supabase account -> owned Creed orders + latest portal session. */
import { getSupabase, issuePortalToken, parseBearer, sanitizeOrderForClient } from './lib-portal.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const jwt = parseBearer(req);
    if (!jwt) return res.status(401).json({ error: 'Sign in required' });

    try {
        const supabase = getSupabase();
        const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
        const user = authData?.user;
        if (authError || !user) return res.status(401).json({ error: 'Invalid account session' });
        if (!user.email_confirmed_at) return res.status(403).json({ error: 'Verify your email before continuing' });

        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', user.id)
            .in('status', ['paid', 'completed'])
            .order('created_at', { ascending: false })
            .limit(50);

        if (ordersError) throw ordersError;

        let portalToken = null;
        if (orders?.length) portalToken = await issuePortalToken(supabase, orders[0].id);

        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
            account: { id: user.id, email: user.email, created_at: user.created_at },
            orders: (orders || []).map(sanitizeOrderForClient),
            portal_token: portalToken,
        });
    } catch (error) {
        console.error('portal-account:', error);
        return res.status(500).json({ error: error.message || 'Unable to load account' });
    }
}
