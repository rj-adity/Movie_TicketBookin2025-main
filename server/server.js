import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import connectDB from './configs/db.js';
import { clerkMiddleware } from '@clerk/express';
import { serve } from "inngest/express";
import { inngest, functions } from "./src/inngest/index.js";
import showRouter from './routes/showRoutes.js';
import adminRouter from './routes/adminRoutes.js';
import userRouter from './routes/userRoutes.js';
import bookingRouter from './routes/bookingRoutes.js';
import { stripeWebhooks } from './controllers/stripeWebhooks.js';

const app = express();
const port = process.env.PORT || 3000;

// Stripe webhook route FIRST (no body parsing before this)
app.use('/api/stripe', express.raw({type: 'application/json'}), stripeWebhooks );

// Now add body parsing and CORS for all other routes
app.use(express.json({ limit: '10mb' }));
// CORS configuration
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? [
        'https://movie-ticket-bookin2025-main.vercel.app',
        'https://movie-ticket-bookin2025.vercel.app' // Add any other frontend domains you might use
      ]
    : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4173'];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(clerkMiddleware());

// API Routes
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Server is Live',
        timestamp: new Date().toISOString()
    });
});

app.use('/api/inngest', serve({ client: inngest, functions }));
app.use('/api/show', showRouter);
app.use('/api/admin', adminRouter);
app.use('/api/user', userRouter);
app.use('/api/booking', bookingRouter);

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    
    // Handle CORS errors specifically
    if (error.message === 'Not allowed by CORS') {
        return res.status(403).json({
            success: false,
            message: 'CORS: Origin not allowed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
    
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// 404 handler LAST
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Only start the server locally (not on Vercel)
if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
    const startServer = async () => {
        try {
            await connectDB();
            console.log('📊 Database: Connected');
            app.listen(port, () => {
                console.log(`✅ Server Running at http://localhost:${port}`);
                console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
            }).on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(`⚠️  Port ${port} is busy, please use a different port.`);
                } else {
                    console.error('❌ Server error:', err);
                }
                process.exit(1);
            });
        } catch (error) {
            console.error('Database initialization failed:', error);
            process.exit(1);
        }
    };
    startServer();
} else {
    // On Vercel, connect to DB on first request (cold start)
    connectDB().then(() => {
        console.log('📊 Database: Connected (Vercel)');
    }).catch((error) => {
        console.error('Database initialization failed (Vercel):', error);
    });
}

// Always export the app for Vercel
export default app;