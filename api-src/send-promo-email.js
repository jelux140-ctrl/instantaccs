/* =========================================
   CREED - PROMO EMAIL COLLECTION
   Sends promo signup emails using EmailJS
   Stores signups in Supabase for admin dashboard
   ========================================= */

import { createClient } from '@supabase/supabase-js';
import { guardPublicPost, validEmail } from './lib-abuse-guard.js';

const getSupabaseClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) return null;
    return createClient(supabaseUrl, supabaseKey);
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const supabase = getSupabaseClient();

        // This endpoint runs with the service role and so bypasses RLS. It is
        // its own trust boundary: without this guard anyone could write
        // arbitrary addresses into promo_signups and send mail from our
        // domain. 5 signups per IP per hour is far above real user behaviour.
        const guard = await guardPublicPost(req, supabase, {
            bucket: 'promo-signup',
            max: 5,
            windowSec: 3600,
        });
        if (!guard.ok) {
            return res.status(guard.status).json({ error: guard.error });
        }

        const { email } = req.body;

        // Previously `email.includes('@')`, which accepted probe addresses
        // such as redteam-probe@test.local.
        if (!validEmail(email)) {
            return res.status(400).json({ error: 'Valid email required' });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Store in Supabase for admin dashboard (client created above)
        if (supabase) {
            try {
                const { data: existing, error: existingError } = await supabase
                    .from('promo_signups')
                    .select('id')
                    .eq('email', normalizedEmail)
                    .limit(1);

                if (!existingError && existing && existing.length > 0) {
                    return res.status(200).json({
                        success: true,
                        message: 'Email already processed'
                    });
                }

                await supabase.from('promo_signups').insert({
                    email: normalizedEmail,
                    created_at: new Date().toISOString()
                });
            } catch (dbError) {
                console.warn('Promo signup DB save failed (table may not exist):', dbError.message);
            }
        }

        // Get EmailJS credentials from environment variables
        const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
        const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
        const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
        const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
        
        const TARGET_EMAIL = 'creedcheats@gmail.com';

        // Email content - match format used in send-order-email.js
        const emailSubject = `🎁 New Promo Signup - ${email}`;
        const emailMessage = `New promo signup from Creed website:\n\nEmail: ${email}\nDate: ${new Date().toLocaleString()}\nSource: Promo Popup (5% OFF Discount)`;

        // Prepare template parameters matching the format used in send-order-email.js
        const templateParams = {
            to_email: TARGET_EMAIL,
            to_name: 'Creed Team',
            from_email: email,
            user_email: email,
            user_name: email.split('@')[0],
            email_subject: emailSubject,
            email_message: emailMessage,
            subject: emailSubject,
            message: emailMessage,
            promo_email: email,
            promo_date: new Date().toLocaleString(),
            discount_code: 'CREED5'
        };

        // Send email using EmailJS REST API (matching exact format from send-order-email.js)
        try {
            const emailResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    service_id: EMAILJS_SERVICE_ID,
                    template_id: EMAILJS_TEMPLATE_ID,
                    user_id: EMAILJS_PUBLIC_KEY,
                    accessToken: EMAILJS_PRIVATE_KEY,
                    template_params: templateParams
                }),
            });

            if (!emailResponse.ok) {
                const errorText = await emailResponse.text();
                console.error('EmailJS API error:', errorText);
                // Don't throw - we'll still return success so discount code shows
                console.warn('EmailJS failed but continuing - discount code will still be shown');
            } else {
                const result = await emailResponse.json();
                console.log('Promo email sent successfully:', result);
            }
        } catch (emailError) {
            console.error('EmailJS send error:', emailError);
            // Don't throw - email is secondary to showing discount code
            console.warn('EmailJS failed but continuing - discount code will still be shown');
        }

        // Always return success - email sending is secondary to showing discount code
        // Even if EmailJS fails, we want to show the user their discount code
        return res.status(200).json({ 
            success: true, 
            message: 'Email processed successfully'
        });

    } catch (error) {
        console.error('Promo email error:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: error.message 
        });
    }
}
