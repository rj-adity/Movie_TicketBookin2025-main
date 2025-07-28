import Booking from "../../models/Booking.js";
import User from "../../models/User.js";
// import your email sending utility here, e.g. nodemailer or a service

/**
 * Send booking confirmation email to user
 * @param {object} booking - Booking document
 */
export async function sendBookingConfirmationEmail(booking) {
  if (!booking || !booking.clerkUserId) return;
  // Find user by clerkUserId
  const user = await User.findOne({ _id: booking.clerkUserId });
  if (!user || !user.email) return;
  // Compose email
  const subject = "Booking Confirmed";
  const text = `Your booking (ID: ${booking._id}) was successful.\nSeats: ${booking.bookedSeats.join(", ")}`;
  // TODO: Replace with your email sending logic
  // await sendEmail(user.email, subject, text);
  console.log(`Email sent to ${user.email}: ${subject} - ${text}`);
}
