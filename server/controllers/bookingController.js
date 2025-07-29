import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import stripe from 'stripe';
import { inngest } from '../src/inngest/index.js';


// Function to check avilability for the selected seats for a movie
const checkSeatsAvailability = async (showId, selectedSeats) => {
    try {
        const showData = await Show.findById(showId)
        if (!showData) return false;

        const occupiedSeats = showData.occupiedSeats;
        const isAnySeatTaken = selectedSeats.some(seat => occupiedSeats[seat]);
        return !isAnySeatTaken;
    } catch (error) {
        console.log(error.message);
        return false;

    }
}

export const createBooking = async (req, res) => {
    try {
        const userId = req.auth.userId || (req.auth && req.auth.userId);
        const { showId, selectedSeats } = req.body;
        const { origin } = req.headers;

        // check if the the seat is avilable for the selected show
        const isAvailable = await checkSeatsAvailability(showId, selectedSeats);
        if (!isAvailable) {
            return res.json({
                success: false, message: 'Selected seats are not available'
            })
        }

        // get the show details
        const showData = await Show.findById(showId).populate('movie');

        // create a new booking
        const booking = await Booking.create({
            clerkUserId: userId, // Use Clerk user ID instead of local user reference
            show: showId,
            amount: showData.showPrice * selectedSeats.length,
            bookedSeats: selectedSeats,
        });

        // Emit booking/created event to Inngest for seat cancellation timer
        try {
          await inngest.send({
            name: 'booking/created',
            data: { bookingId: booking._id?.toString?.() }
          });
          console.log('⏳ booking/created event emitted to Inngest');
        } catch (err) {
          console.error('❌ Failed to emit booking/created event to Inngest:', err);
        }

        selectedSeats.map((seat) => {
            showData.occupiedSeats[seat] = userId;
        })

        showData.markModified('occupiedSeats');
        await showData.save();


        // Stripe Gateway Initialize

        const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY)
        // Creating Line items for stripe
        const lineitems = [{
            price_data: {
                currency : 'inr',
                product_data: {
                    name: showData.movie.title
                },
                unit_amount : Math.floor(booking.amount) * 100       
            },
            quantity: 1
        }]

        const session = await stripeInstance.checkout.sessions.create({
            success_url : `${origin }/loading/my-bookings?payment_completed=true`,
            cancel_url : `${origin }/my-bookings`,
            line_items: lineitems,
            mode: 'payment',
            metadata: {
                bookingId: booking._id.toString(),
                showId: showId,
                clerkUserId: userId,
                amount: booking.amount.toString(),
                bookedSeats: JSON.stringify(selectedSeats)
            },
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60,  // expires in thirty minutes
        })

        // Set payment expiry time (30 minutes from now)
        const paymentExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
        
        booking.paymentLink = session.url;
        booking.paymentExpiresAt = paymentExpiresAt;
        await booking.save()


        res.json({
            success: true,
            url: session.url
        })
    } catch (error) {
        console.log(error.message);
        res.json({
            success: false, message: 'Failed to create booking'
        })

    }
}

export const getOccupiedSeats = async (req, res) => {
    try {
        const { showId } = req.params;

        const showData = await Show.findById(showId)
        const occupiedSeats = Object.keys(showData.occupiedSeats)

        res.json({
            success: true,
            occupiedSeats
        });

    } catch (error) {
        console.log(error.message);
        res.json({
            success: false, message: 'Failed to create booking'
        })

    }
}
