/* =========================================
   CREED - TEST RESEND ENDPOINT
   Sends a test customer receipt email without placing an order
   ========================================= */

const getAuthToken = (req) => req.headers.authorization || req.headers['x-creed-staff-token'];

const getTargetEmail = (req) => {
    if (req.method === 'GET') {
        return req.query.email;
    }

    return req.body?.email || req.query.email;
};

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authToken = getAuthToken(req);
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

    if (!ADMIN_TOKEN || (authToken !== `Bearer ${ADMIN_TOKEN}` && authToken !== ADMIN_TOKEN)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        const FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
        const targetEmail = getTargetEmail(req);

        if (!RESEND_API_KEY) {
            return res.status(500).json({ error: 'Resend API key missing' });
        }

        if (!targetEmail) {
            return res.status(400).json({
                error: 'Missing target email',
                usage: 'Send the admin token in the Authorization header and provide ?email=you@example.com'
            });
        }

        const testOrder = {
            id: `test_${Date.now()}`,
            sessionId: 'cs_test_resend_001',
            amount: '9.99',
            currency: 'USD',
            customerEmail: targetEmail,
            createdAt: new Date().toISOString(),
            items: [
                {
                    name: 'Resend Test Product',
                    variant: '1 Month',
                    price: '9.99',
                    quantity: 1
                }
            ]
        };

        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
            </head>
            <body style="font-family: Arial, sans-serif; background: #111; color: #fff; padding: 20px;">
                <div style="max-width: 600px; margin: 0 auto; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #FFB800 0%, #FFD700 100%); color: #000; padding: 24px; text-align: center;">
                        <h1 style="margin: 0;">Resend Test Email</h1>
                    </div>
                    <div style="padding: 24px;">
                        <p>This confirms Resend is connected and can send from your deployment.</p>
                        <p><strong>Order ID:</strong> ${testOrder.id}</p>
                        <p><strong>Session ID:</strong> ${testOrder.sessionId}</p>
                        <p><strong>Email:</strong> ${targetEmail}</p>
                        <p><strong>Amount:</strong> $${testOrder.amount} ${testOrder.currency}</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: `Creed Store <${FROM_EMAIL}>`,
                to: [targetEmail],
                subject: `Resend Test - ${testOrder.id}`,
                html: emailHtml
            })
        });

        const rawResponse = await resendResponse.text();
        let parsedResponse = null;

        try {
            parsedResponse = JSON.parse(rawResponse);
        } catch {
            parsedResponse = { raw: rawResponse };
        }

        if (!resendResponse.ok) {
            return res.status(500).json({
                success: false,
                error: 'Resend send failed',
                status: resendResponse.status,
                details: parsedResponse
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Test email sent via Resend',
            to: targetEmail,
            from: FROM_EMAIL,
            orderId: testOrder.id,
            resend: parsedResponse
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
}
