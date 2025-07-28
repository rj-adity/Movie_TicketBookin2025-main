import { Inngest } from "inngest";
import User from "../../models/User.js";
import Booking from "../../models/Booking.js";
import { cancelBookingAndReleaseSeats } from "./cancelBooking.js";
import { sendBookingConfirmationEmail } from "./sendBookingEmail.js";

export const inngest = new Inngest({ id: "movie-ticket-booking" });

// Inngest function to save user data to a database
const syncUserCreation = inngest.createFunction(
  { id: "sync-user-from-clerk" },
  { event: "clerk/user.created" },
  async ({ event, step }) => {
    try {
      const { id, first_name, last_name, email_addresses, image_url } = event.data;

      // Validate required data
      if (!id || !email_addresses || !email_addresses[0]) {
        throw new Error('Missing required user data');
      }

      const userData = {
        _id: id,
        email: email_addresses[0].email_address,
        name: `${first_name || ''} ${last_name || ''}`.trim() || 'Unknown User',
        image: image_url || '',
      };

      await step.run("create-user", async () => {
        return await User.create(userData);
      });

      console.log(`User created successfully: ${userData.email}`);
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }
);

// Inngest function to delete user from database
const syncUserDeletion = inngest.createFunction(
  { id: "delete-user-with-clerk" },
  { event: "clerk/user.deleted" },
  async ({ event, step }) => {
    try {
      const { id } = event.data;

      if (!id) {
        throw new Error('User ID is required for deletion');
      }

      await step.run("delete-user", async () => {
        return await User.findByIdAndDelete(id);
      });

      console.log(`User deleted successfully: ${id}`);
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }
);

// Inngest function to update user data in MongoDB
const syncUserUpdation = inngest.createFunction(
  { id: "update-user-from-clerk" },
  { event: "clerk/user.updated" },
  async ({ event, step }) => {
    try {
      const { id, first_name, last_name, email_addresses, image_url } = event.data;

      if (!id) {
        throw new Error('User ID is required for update');
      }

      const userData = {
        email: email_addresses?.[0]?.email_address || '',
        name: `${first_name || ''} ${last_name || ''}`.trim() || 'Unknown User',
        image: image_url || '',
      };

      await step.run("update-user", async () => {
        return await User.findByIdAndUpdate(id, userData, { new: true });
      });

      console.log(`User updated successfully: ${userData.email}`);
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }
);

// Ingest functiions to cancel bookings 

// Inngest function to send email when user makes a successful booking
const sendBookingEmail = inngest.createFunction(
  { id: "send-booking-confirmation-email" },
  { event: "booking/paid" },
  async ({ event, step }) => {
    const { bookingId } = event.data;
    if (!bookingId) throw new Error("bookingId missing in event data");

    // Fetch booking
    const booking = await step.run("fetch-booking", async () => {
      return await Booking.findById(bookingId);
    });
    if (!booking) return;

    // Send email
    await step.run("send-booking-email", async () => {
      await sendBookingConfirmationEmail(booking);
    });
  }
);

// Inngest function to cancel booking and release seats after 20 minutes if payment is not made
const cancelUnpaidBooking = inngest.createFunction(
  { id: "cancel-unpaid-booking" },
  { event: "booking/created" },
  async ({ event, step }) => {
    const { bookingId } = event.data;
    if (!bookingId) throw new Error("bookingId missing in event data");

    // Wait for 20 minutes
    await step.sleep("wait-20-minutes", 20 * 60 * 1000);

    // Fetch booking again
    const booking = await step.run("fetch-booking", async () => {
      return await Booking.findById(bookingId);
    });
    if (!booking) return;
    if (booking.isPaid) return; // Payment completed, do nothing

    // Cancel booking and release seats
    await step.run("cancel-booking-and-release-seats", async () => {
      await cancelBookingAndReleaseSeats(booking);
    });
  }
);

// Export all the Inngest functions in an array
export const functions = [syncUserCreation, syncUserDeletion, syncUserUpdation, cancelUnpaidBooking, sendBookingEmail];
