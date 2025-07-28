import Booking from "../models/Booking.js";
import Show from "../models/Show.js"
import stripe from 'stripe'


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
        })

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

// Regenerate payment link for expired bookings
export const regeneratePaymentLink = async (req, res) => {
    try {
        const userId = req.auth.userId;
        const { bookingId } = req.params;
        const { origin } = req.headers;

        // Find the booking
        const booking = await Booking.findById(bookingId).populate({
            path: 'show',
            populate: { path: 'movie' }
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Check if booking belongs to user
        if (booking.clerkUserId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Check if booking is already paid
        if (booking.isPaid) {
            return res.status(400).json({
                success: false,
                message: 'Booking is already paid'
            });
        }

        // Check if payment link is expired (30 minutes)
        const now = new Date();
        const isExpired = !booking.paymentExpiresAt || now > booking.paymentExpiresAt;

        if (!isExpired) {
            return res.status(400).json({
                success: false,
                message: 'Payment link is still valid'
            });
        }

        // Create new Stripe session
        const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);
        
        const lineitems = [{
            price_data: {
                currency: 'inr',
                product_data: {
                    name: booking.show.movie.title
                },
                unit_amount: Math.floor(booking.amount) * 100
            },
            quantity: 1
        }];

        const session = await stripeInstance.checkout.sessions.create({
            success_url: `${origin}/loading/my-bookings?payment_completed=true`,
            cancel_url: `${origin}/my-bookings`,
            line_items: lineitems,
            mode: 'payment',
            metadata: {
                bookingId: booking._id.toString(),
            },
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // expires in thirty minutes
        });

        // Update booking with new payment link and expiry
        const paymentExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
        
        booking.paymentLink = session.url;
        booking.paymentExpiresAt = paymentExpiresAt;
        await booking.save();

        res.json({
            success: true,
            url: session.url,
            message: 'New payment link generated'
        });

    } catch (error) {
        console.error('Error regenerating payment link:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to regenerate payment link'
        });
    }
}