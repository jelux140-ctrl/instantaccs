/* Public Supabase URL + anon key for browser auth (anon key is safe to expose). */

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
        return res.status(503).json({ error: 'Supabase not configured' });
    }
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json({ url, anonKey });
}
