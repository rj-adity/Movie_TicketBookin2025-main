import Stripe from 'stripe';
import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import { inngest } from '../src/inngest/index.js';

const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);

export const stripeWebhooks = async (request, response) => {
    console.log('🔄 Stripe webhook received');
    console.log('📋 Headers:', {
        'stripe-signature': request.headers['stripe-signature'] ? 'Present' : 'Missing',
        'content-type': request.headers['content-type'],
        'user-agent': request.headers['user-agent']
    });

    const sig = request.headers['stripe-signature'];

    if (!sig) {
        console.error('❌ Missing stripe-signature header');
        return response.status(400).send('Missing stripe-signature header');
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.error('❌ STRIPE_WEBHOOK_SECRET not configured');
        return response.status(500).send('Webhook secret not configured');
    }

    let event;

    try {
        console.log('🔐 Verifying webhook signature...');
        event = stripeInstance.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        console.log('✅ Webhook signature verified');
    } catch (error) {
        console.error('❌ Webhook signature verification failed:', error.message);
        return response.status(400).send(`Webhook Error: ${error.message}`);
    }

    console.log("📨 Processing Stripe event:", event.type);
    console.log("🆔 Event ID:", event.id);


    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const bookingId = session?.metadata?.bookingId;
        const sessionId = session.id;
        const paymentIntentId = session.payment_intent;
        console.log('🟦 Calling updateBookingPaid for checkout.session.completed');
        const result = await updateBookingPaid(bookingId, 'checkout.session.completed', sessionId, paymentIntentId);
        console.log('🟪 updateBookingPaid returned:', result);
    } else if (event.type === 'payment_intent.succeeded') {
        // Handle payment_intent.succeeded in case checkout.session.completed is missed
        const paymentIntent = event.data.object;
        const paymentIntentId = paymentIntent.id;
        const amount = paymentIntent.amount;
        const currency = paymentIntent.currency;
        console.log('💰 Processing payment_intent.succeeded');
        console.log('💳 PaymentIntent ID:', paymentIntentId);
        console.log('💵 Amount:', amount);
        console.log('💱 Currency:', currency);

        // Try to find the related Checkout Session
        let session = null;
        try {
            const sessionList = await stripeInstance.checkout.sessions.list({
                payment_intent: paymentIntentId,
                limit: 1
            });
            if (sessionList.data.length > 0) {
                session = sessionList.data[0];
            }
        } catch (err) {
            console.error('❌ Error fetching session for payment_intent:', err);
        }

        if (session && session.metadata && session.metadata.bookingId) {
            const bookingId = session.metadata.bookingId;
            console.log('🎫 Found bookingId in session:', bookingId);
            console.log('🟦 Calling updateBookingPaid for payment_intent.succeeded');
            const result = await updateBookingPaid(bookingId, 'payment_intent.succeeded', session.id, paymentIntentId);
            console.log('🟪 updateBookingPaid returned:', result);
        } else {
            console.error('❌ BookingId not found in session metadata for payment_intent:', paymentIntentId);
        }
    }

    response.status(200).send('✅ Webhook handled');
};

// ✅ Helper function to mark booking as paid or create it from session metadata
async function updateBookingPaid(bookingId, source, sessionId, paymentIntentId) {

    console.log('🟢 Entered updateBookingPaid with bookingId:', bookingId, '| source:', source, '| sessionId:', sessionId, '| paymentIntentId:', paymentIntentId);
    if (!bookingId) {
        console.warn('⚠️ No bookingId provided to updateBookingPaid, aborting fallback.');
        return false;
    }

    const objectId = mongoose.Types.ObjectId.isValid(bookingId)
        ? new mongoose.Types.ObjectId(bookingId)
        : bookingId;

    let attempts = 0;
    const maxAttempts = 3;
    const delay = ms => new Promise(res => setTimeout(res, ms));

    while (attempts < maxAttempts) {
        try {
            const updateResult = await Booking.findByIdAndUpdate(
                objectId,
                {
                    isPaid: true,
                    paymentLink: '',
                    updatedAt: new Date()
                },
                { new: true }
            );

            if (updateResult) {
                console.log(`✅ Booking updated as paid from ${source}:`, bookingId);
                // Emit booking/paid event to Inngest
                try {
                  await inngest.send({
                    name: 'booking/paid',
                    data: { bookingId: updateResult._id?.toString?.() || bookingId }
                  });
                  console.log('📧 booking/paid event emitted to Inngest');
                } catch (err) {
                  console.error('❌ Failed to emit booking/paid event to Inngest:', err);
                }
                return true;
            } else {
                attempts++;
                if (attempts < maxAttempts) {
                    console.warn(`⏳ Booking not found, retrying (${attempts}/${maxAttempts})...`);
                    await delay(1000);
                } else {
                    console.error(`❌ Booking not found after ${maxAttempts} attempts:`, bookingId);
                    break;
                }
            }
        } catch (err) {
            console.error(`❌ Error updating booking from ${source}:`, err);
            break;
        }
    }


    console.log('🟡 Finished update attempts, now entering fallback booking creation logic for bookingId:', bookingId);
    console.log('🚨 Entering fallback booking creation logic for bookingId:', bookingId);

    // Try to create the booking if not found
    try {
        let stripeSession = null;

        if (sessionId) {
            stripeSession = await stripeInstance.checkout.sessions.retrieve(sessionId);
        } else if (paymentIntentId) {
            const sessionList = await stripeInstance.checkout.sessions.list({
                payment_intent: paymentIntentId
            });
            if (sessionList.data.length > 0) {
                stripeSession = sessionList.data[0];
            }
        }

        if (stripeSession?.metadata) {
            const { showId, clerkUserId, amount, bookedSeats } = stripeSession.metadata;
            console.log('📝 Stripe session metadata for fallback booking creation:', stripeSession.metadata);

            if (showId && clerkUserId && amount && bookedSeats) {
                try {
                    const newBooking = await Booking.create({
                        _id: objectId,
                        show: showId,
                        clerkUserId,
                        amount: Number(amount),
                        bookedSeats: JSON.parse(bookedSeats),
                        isPaid: true,
                        paymentLink: '',
                        paymentExpiresAt: new Date()
                    });
                    console.log(`✅ Booking created from Stripe session and marked as paid:`, newBooking._id);
                    return true;
                } catch (creationError) {
                    console.error('❌ Error during Booking.create fallback:', creationError, '\nMetadata:', stripeSession.metadata);
                }
            } else {
                console.error('❌ Not enough metadata to create booking from Stripe session:', stripeSession.metadata);
            }
        } else {
            console.error('❌ Stripe session not found or missing metadata:', sessionId, paymentIntentId);
        }
    } catch (createErr) {
        console.error('❌ Error creating booking from Stripe session:', createErr);
    }

    return false;
}
