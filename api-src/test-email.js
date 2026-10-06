/* =========================================
   CREED - TEST EMAIL ENDPOINT
   Tests email sending functionality
   ========================================= */

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Simple authentication
    const authToken = req.headers.authorization || req.headers['x-creed-staff-token'];
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

    if (!ADMIN_TOKEN || (authToken !== `Bearer ${ADMIN_TOKEN}` && authToken !== ADMIN_TOKEN)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Create a test order
        const testOrder = {
            id: `test_${Date.now()}`,
            sessionId: 'test_session_123',
            status: 'completed',
            amount: '3.95',
            currency: 'GBP',
            customerEmail: 'test@example.com',
            items: [
                {
                    name: 'Fortnite Public',
                    variant: '1 Month',
                    price: '5.00',
                    quantity: 1
                }
            ],
            createdAt: new Date().toISOString(),
            paidAt: new Date().toISOString()
        };

        // Get EmailJS credentials
        const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
        const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
        const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
        const ADMIN_EMAILS = ['circuitcash5@gmail.com'];

        // Styled test email HTML
        const testEmailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                    <div style="background: linear-gradient(135deg, #FFB800 0%, #FFD700 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                        <h1 style="color: #000; margin: 0; font-size: 28px;">🎮 Test Email - Creed Store</h1>
                    </div>
                    <div style="padding: 30px; background-color: #f9f9f9;">
                        <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            <h2 style="margin-top: 0; color: #FFB800; font-size: 24px; border-bottom: 2px solid #FFB800; padding-bottom: 10px;">Email System Test</h2>
                            <p style="font-size: 16px; color: #333; margin: 20px 0;">This is a test email to verify that the EmailJS integration is working correctly!</p>
                            <div style="background: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
                                <p style="margin: 5px 0;"><strong>Test Order ID:</strong> ${testOrder.id}</p>
                                <p style="margin: 5px 0;"><strong>Test Item:</strong> ${testOrder.items[0].name}</p>
                                <p style="margin: 5px 0;"><strong>Test Amount:</strong> $${testOrder.items[0].price}</p>
                            </div>
                            <p style="color: #666; font-size: 14px; margin-top: 25px;">If you received this email, the notification system is working perfectly! ✅</p>
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; background-color: #f9f9f9; border-top: 1px solid #eee; border-radius: 0 0 8px 8px;">
                        <p style="color: #666; font-size: 12px; margin: 0;">Creed Gaming Store - Email Notification System</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        // Send test emails using EmailJS
        const emailPromises = ADMIN_EMAILS.map(async (adminEmail) => {
            const templateParams = {
                to_email: adminEmail,
                to_name: 'Admin',
                email_html: testEmailHtml,
                email_subject: '🎮 Test Email - Creed Store Email System',
                email_message: 'This is a test email to verify EmailJS integration is working!',
                test_info: `Test Order ID: ${testOrder.id}`
            };

            const emailResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    service_id: EMAILJS_SERVICE_ID,
                    template_id: 'template_order', // You'll need to create this template in EmailJS dashboard
                    user_id: EMAILJS_PUBLIC_KEY,
                    accessToken: EMAILJS_PRIVATE_KEY,
                    template_params: templateParams
                }),
            });

            if (!emailResponse.ok) {
                const errorText = await emailResponse.text();
                throw new Error(`EmailJS API error for ${adminEmail}: ${errorText}`);
            }

            return await emailResponse.json();
        });

        const emailResults = await Promise.all(emailPromises);
        
        return res.status(200).json({
            success: true,
            message: 'Test emails sent successfully! Check the configured admin inbox.',
            testOrder: testOrder,
            emailResults: emailResults
        });

    } catch (error) {
        console.error('Test email error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to send test email',
            message: error.message
        });
    }
}
