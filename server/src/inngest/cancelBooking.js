import Booking from "../../models/Booking.js";
import Show from "../../models/Show.js";

/**
 * Cancel booking and release seats if payment is not made within 20 minutes
 * @param {object} booking - Booking document
 */
export async function cancelBookingAndReleaseSeats(booking) {
  if (!booking) return;
  // Only cancel unpaid bookings
  if (booking.isPaid) return;
  // Remove seats from occupiedSeats in Show
  const show = await Show.findById(booking.show);
  if (show) {
    for (const seat of booking.bookedSeats) {
      if (show.occupiedSeats[seat] && show.occupiedSeats[seat] === booking.clerkUserId) {
        delete show.occupiedSeats[seat];
      }
    }
    show.markModified('occupiedSeats');
    await show.save();
  }
  // Delete the booking
  await Booking.findByIdAndDelete(booking._id);
}
