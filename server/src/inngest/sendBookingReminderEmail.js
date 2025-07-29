import nodemailer from "nodemailer";
import Booking from "../../models/Booking.js";
import User from "../../models/User.js";

/**
 * Sends a reminder email to the user 8 hours before their booked show time.
 * This function should be triggered with booking data.
 */
export async function sendBookingReminderEmail(booking) {
  if (!booking) return;

  // Fetch user details
  const user = await User.findById(booking.userId);
  if (!user || !user.email) return;

  // Calculate reminder time (8 hours before show)
  const showDateTime = new Date(booking.showDateTime);
  const reminderTime = new Date(showDateTime.getTime() - 8 * 60 * 60 * 1000);
  const now = new Date();

  if (reminderTime <= now) {
    // If reminder time already passed, send immediately
    await sendEmail(user.email, booking);
  } else {
    // Schedule sending email at reminderTime
    const delay = reminderTime.getTime() - now.getTime();
    setTimeout(async () => {
      await sendEmail(user.email, booking);
    }, delay);
  }
}

async function sendEmail(email, booking) {
  const subject = `Reminder: Your show is coming up soon!`;
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #18181b; color: #fff; padding: 32px; border-radius: 16px; max-width: 600px; margin: auto;">
      <h2 style="color: #ffb300; margin-bottom: 8px;">Reminder for your upcoming show!</h2>
      <p style="font-size: 1.2rem; margin-bottom: 16px;">Dear ${booking.userName || 'User'},</p>
      <p style="font-size: 1.1rem; margin-bottom: 8px;">This is a reminder that your booked show <b>${booking.showTitle}</b> is scheduled for <b>${new Date(booking.showDateTime).toLocaleString()}</b>.</p>
      <p style="margin-bottom: 24px;">We hope you enjoy the show! Please arrive on time.</p>
      <div style="margin-top: 24px; font-size: 0.95rem; color: #aaa;">This is an automated reminder from Chitrapat.</div>
    </div>
  `;

  // Setup transporter
  let transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SENDER_EMAIL || 'no-reply@chitrapat.com',
    to: email,
    subject,
    html,
  });
}
