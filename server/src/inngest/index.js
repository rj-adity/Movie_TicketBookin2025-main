import { Inngest } from "inngest";
import User from "../../models/User.js";
import Booking from "../../models/Booking.js";
import { cancelBookingAndReleaseSeats } from "./cancelBooking.js";
import { sendBookingConfirmationEmail } from "./sendBookingEmail.js";
import { sendNewShowReminderEmail } from "./sendNewShowReminderEmail.js";
import Show from "../../models/Show.js";
import Movie from "../../models/Movies.js";

// Initialize Inngest instance
export const inngest = new Inngest({ id: "movie-ticket-booking" });

// ✅ Send reminder to all users when a new show is added
const sendNewShowReminder = inngest.createFunction(
  { id: "send-new-show-reminder" },
  { event: "show/created" },
  async ({ event, step }) => {
    const { showId } = event.data;
    if (!showId) throw new Error("showId missing in event data");

    const show = await step.run("fetch-show", async () => {
      return await Show.findById(showId);
    });
    if (!show) return;

    const movie = await step.run("fetch-movie", async () => {
      return await Movie.findById(show.movie);
    });
    if (!movie) return;

    const showInfo = {
      title: movie.title,
      posterUrl: movie.poster_path,
      date: show.showDateTime ? new Date(show.showDateTime).toLocaleDateString() : '',
      time: show.showDateTime ? new Date(show.showDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      movieId: movie._id,
    };

    await step.run("send-reminder-emails", async () => {
      await sendNewShowReminderEmail(showInfo);
    });
  }
);

// ✅ Sync user creation from Clerk
const syncUserCreation = inngest.createFunction(
  { id: "sync-user-from-clerk" },
  { event: "clerk/user.created" },
  async ({ event, step }) => {
    try {
      const { id, first_name, last_name, email_addresses, image_url } = event.data;
      const userData = {
        _id: id,
        email: email_addresses?.[0]?.email_address || '',
        name: `${first_name || ''} ${last_name || ''}`.trim() || 'Unknown User',
        image: image_url || '',
      };

      await step.run("create-user", async () => {
        return await User.create(userData);
      });

      console.log(`✅ User created successfully: ${userData.email}`);
    } catch (error) {
      console.error('❌ Error creating user:', error);
      throw error;
    }
  }
);

// ✅ Sync user deletion from Clerk
const syncUserDeletion = inngest.createFunction(
  { id: "delete-user-with-clerk" },
  { event: "clerk/user.deleted" },
  async ({ event, step }) => {
    try {
      const { id } = event.data;
      if (!id) throw new Error('User ID is required for deletion');

      await step.run("delete-user", async () => {
        return await User.findByIdAndDelete(id);
      });

      console.log(`✅ User deleted successfully: ${id}`);
    } catch (error) {
      console.error('❌ Error deleting user:', error);
      throw error;
    }
  }
);

// ✅ Sync user update from Clerk
const syncUserUpdation = inngest.createFunction(
  { id: "update-user-from-clerk" },
  { event: "clerk/user.updated" },
  async ({ event, step }) => {
    try {
      const { id, first_name, last_name, email_addresses, image_url } = event.data;
      if (!id) throw new Error('User ID is required for update');

      const userData = {
        email: email_addresses?.[0]?.email_address || '',
        name: `${first_name || ''} ${last_name || ''}`.trim() || 'Unknown User',
        image: image_url || '',
      };

      await step.run("update-user", async () => {
        return await User.findByIdAndUpdate(id, userData, { new: true });
      });

      console.log(`✅ User updated successfully: ${userData.email}`);
    } catch (error) {
      console.error('❌ Error updating user:', error);
      throw error;
    }
  }
);

// ✅ Send confirmation email on booking
const sendBookingEmail = inngest.createFunction(
  { id: "send-booking-confirmation-email" },
  { event: "booking/paid" },
  async ({ event, step }) => {
    const { bookingId } = event.data;
    if (!bookingId) throw new Error("bookingId missing in event data");

    const booking = await step.run("fetch-booking", async () => {
      return await Booking.findById(bookingId);
    });
    if (!booking) return;

    await step.run("send-booking-email", async () => {
      await sendBookingConfirmationEmail(booking);
    });
  }
);

// ✅ Cancel unpaid booking after 20 minutes
const cancelUnpaidBooking = inngest.createFunction(
  { id: "cancel-unpaid-booking" },
  { event: "booking/created" },
  async ({ event, step }) => {
    const { bookingId } = event.data;
    if (!bookingId) throw new Error("bookingId missing in event data");

    await step.sleep("wait-20-minutes", 20 * 60 * 1000);

    const booking = await step.run("fetch-booking", async () => {
      return await Booking.findById(bookingId);
    });
    if (!booking || booking.isPaid) return;

    await step.run("cancel-booking-and-release-seats", async () => {
      await cancelBookingAndReleaseSeats(booking);
    });
  }
);

// ✅ Export all functions for registration
export const functions = [
  syncUserCreation,
  syncUserDeletion,
  syncUserUpdation,
  cancelUnpaidBooking,
  sendBookingEmail,
  sendNewShowReminder
];
