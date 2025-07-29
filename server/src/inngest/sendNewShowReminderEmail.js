import nodemailer from "nodemailer";
import User from "../../models/User.js";

export async function sendNewShowReminderEmail(show) {
  // Fetch all users
  const users = await User.find({}, { email: 1, name: 1 });
  if (!users.length) return;

  // Compose stylish HTML email
  const subject = `🎬 New Show Added: ${show.title}`;
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #18181b; color: #fff; padding: 32px; border-radius: 16px; max-width: 600px; margin: auto;">
      <h2 style="color: #ffb300; margin-bottom: 8px;">A New Show Has Been Added!</h2>
      <h1 style="font-size: 2rem; margin: 0 0 16px 0;">{show.title}</h1>
      <img src="${show.posterUrl || ''}" alt="${show.title}" style="width: 100%; max-width: 320px; border-radius: 12px; margin-bottom: 16px;" />
      <p style="font-size: 1.1rem; margin-bottom: 8px;">Date: <b>${show.date}</b></p>
      <p style="font-size: 1.1rem; margin-bottom: 8px;">Time: <b>${show.time}</b></p>
      <p style="margin-bottom: 24px;">Don't miss out! Book your tickets now on <a href="https://{your-domain}/movies/${show.movieId}" style="color: #ffb300; text-decoration: underline;">Chitrapat</a>.</p>
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

  // Send to all users
  for (const user of users) {
    await transporter.sendMail({
      from: process.env.SENDER_EMAIL || 'no-reply@chitrapat.com',
      to: user.email,
      subject,
      html: html.replace('{show.title}', show.title),
    });
  }
}
