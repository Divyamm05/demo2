require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { OpenAI } = require('openai');
const session = require('express-session');
const admin = require('firebase-admin'); // Firebase Admin SDK

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Check for required environment variables
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.SESSION_SECRET || !process.env.OPENAI_API_KEY) {
  console.error("Missing required environment variables. Please check your .env file.");
  process.exit(1);
}

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_CREDENTIALS, 'base64').toString('utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore(); // Firestore instance

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Session timeout duration in milliseconds (e.g., 30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000;

// Session management setup
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, // Set to true if using HTTPS in production
      maxAge: SESSION_TIMEOUT,
    },
  })
);

// Middleware to check session validity for protected routes
function checkSession(req, res, next) {
  if (!req.session.email || !req.session.verified) {
    return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
  }
  next();
}

// API Routes

// Check if email exists in Firestore and send OTP
app.post('/api/check-email', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required." });
  }

  req.session.email = email;

  try {
    const usersRef = db.collection('users');
    const query = await usersRef.where('email', '==', email).get(); // Query to match email field

    if (query.empty) {
      return res.status(404).json({ success: false, message: "Email not found in our records." });
    }

    const userDoc = query.docs[0]; // Access the first matching document

    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 60000); // OTP expiration time (1 minute)

    const otpRef = db.collection('otp_records').doc(email);
    await otpRef.set({
      otp,
      expires_at: expiresAt,
    }, { merge: true });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP code is: ${otp}. It is valid for 1 minute.`,
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'OTP sent to your email address.' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// Resend OTP if valid or generate new OTP
app.post('/api/resend-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required." });
  }

  try {
    const otpRef = db.collection('otp_records').doc(email);
    const otpDoc = await otpRef.get();

    if (otpDoc.exists && otpDoc.data().expires_at.toDate() > new Date()) {
      const otp = otpDoc.data().otp;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your OTP Code',
        text: `Your OTP code is: ${otp}. It is still valid for 1 minute.`,
      };

      await transporter.sendMail(mailOptions);
      res.json({ success: true, message: 'OTP resent to your email address.' });
    } else {
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 60000);

      await otpRef.set({
        otp,
        expires_at: expiresAt,
      }, { merge: true });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your OTP Code',
        text: `Your OTP code is: ${otp}. It is valid for 1 minute.`,
      };

      await transporter.sendMail(mailOptions);
      res.json({ success: true, message: 'New OTP sent to your email address.' });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// Verify OTP and update session
app.post('/api/verify-otp', async (req, res) => {
  const { otp } = req.body;
  const email = req.session.email;

  if (!email || !otp) {
    return res.status(400).json({ success: false, message: "Email and OTP are required." });
  }

  try {
    const otpRef = db.collection('otp_records').doc(email);
    const otpDoc = await otpRef.get();

    if (!otpDoc.exists || otpDoc.data().expires_at.toDate() < new Date()) {
      return res.status(404).json({ success: false, message: "OTP not found or expired." });
    }

    if (otp !== otpDoc.data().otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP." });
    }

    req.session.verified = true;
    req.session.userState = 'awaiting_domain_input';

    await otpRef.delete();

    res.json({ success: true, message: "OTP verified successfully." });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// Protected route for domain suggestions (requires session)
app.post('/api/domain-suggestions', checkSession, async (req, res) => {
  const { domain } = req.body;

  if (!domain) {
    return res.status(400).json({ success: false, message: "Domain is required." });
  }

  try {
    // Initialize session conversation history if not already set
    if (!req.session.conversationHistory) {
      req.session.conversationHistory = [];
    }

    // Add domain suggestion request to the conversation history
    req.session.conversationHistory.push({ role: 'user', content: `Provide 10 domain name suggestions related to: ${domain}` });

    // Generate domain suggestions using OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: req.session.conversationHistory, // Include the full conversation history
      max_tokens: 100,
    });

    const suggestions = response.choices[0].message.content.trim().split('\n').map(s => s.trim());

    // Store the suggestions in the conversation history
    req.session.conversationHistory.push({
      role: 'assistant',
      content: suggestions.join(', '), // Store the suggestions as GPT's response
    });

    res.json({
      success: true,
      suggestions,
      message: "Domain suggestions provided and stored in session.",
    });
  } catch (error) {
    console.error('Error generating domain suggestions:', error);
    res.status(500).json({ success: false, message: "Error generating suggestions." });
  }
});

// Chat with OpenAI (protected route)
// Chat with OpenAI (protected route)
app.post('/api/chat', checkSession, async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ success: false, message: "Query is required." });
  }

  try {
    // Initialize session conversation history if not already set
    if (!req.session.conversationHistory) {
      req.session.conversationHistory = [];
    }

    // Add the new user query to the conversation history
    req.session.conversationHistory.push({ role: 'user', content: query });

    // Send the conversation history to OpenAI to continue the chat
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: req.session.conversationHistory, // Pass the full conversation history
      max_tokens: 150,
    });

    const assistantReply = response.choices[0].message.content;

    // Add the assistant's response to the conversation history
    req.session.conversationHistory.push({
      role: 'assistant',
      content: assistantReply,
    });

    res.json({
      success: true,
      answer: assistantReply,
    });
  } catch (error) {
    console.error('Error during chat:', error);
    res.status(500).json({ success: false, message: "Failed to process your question." });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
