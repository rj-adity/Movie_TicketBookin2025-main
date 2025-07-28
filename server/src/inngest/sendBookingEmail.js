

import Booking from "../../models/Booking.js";
import User from "../../models/User.js";
import Show from "../../models/Show.js";
import Movie from "../../models/Movies.js";
import nodemailer from "nodemailer";

/**
 * Send booking confirmation email to user
 * @param {object} booking - Booking document
 */


// Send booking confirmation email using Nodemailer (official documentation style)
export async function sendBookingConfirmationEmail(booking) {
  if (!booking || !booking.clerkUserId) return;
  const user = await User.findOne({ _id: booking.clerkUserId });
  if (!user || !user.email) return;

  // Fetch show and movie details
  const show = await Show.findById(booking.show);
  let movie = null;
  if (show && show.movie) {
    movie = await Movie.findById(show.movie);
  }

  // Compose email content
  const subject = "Your Movie Ticket Booking is Confirmed!";
  let html = `<div style='font-family:sans-serif;'>`;
  html += `<h2>Hi ${user.name || "User"},</h2>`;
  html += `<p>Your booking was <b>successful</b>!</p>`;
  if (movie) {
    html += `<h3>${movie.title}</h3>`;
    if (movie.tagline) html += `<p><i>${movie.tagline}</i></p>`;
    if (movie.genres && movie.genres.length) html += `<p>Genre: ${movie.genres.map(g=>g.name).join(", ")}</p>`;
    if (movie.original_language) html += `<p>Language: ${movie.original_language}</p>`;
    if (movie.runtime) html += `<p>Duration: ${movie.runtime} min</p>`;
    if (movie.release_date) html += `<p>Release Date: ${movie.release_date}</p>`;
  }
  if (show) {
    html += `<p><b>Show Date & Time:</b> ${new Date(show.showDateTime).toLocaleString()}</p>`;
    html += `<p><b>Ticket Price:</b> ₹${show.showPrice}</p>`;
  }
  html += `<p><b>Seats:</b> ${booking.bookedSeats.join(", ")}</p>`;
  html += `<p><b>Total Amount:</b> ₹${booking.amount}</p>`;
  html += `<p><b>Booking ID:</b> ${booking._id}</p>`;
  html += `<br><p>Enjoy your movie!<br>- Team Movie Ticket Booking</p></div>`;

  // Create reusable transporter object using SMTP transport (Nodemailer docs)
  let transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false, // Brevo recommends false for port 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  // Send mail with defined transport object
  await transporter.sendMail({
    from: process.env.SENDER_EMAIL || 'no-reply@movieticket.com',
    to: user.email,
    subject: subject,
    html: html,
  });
}
