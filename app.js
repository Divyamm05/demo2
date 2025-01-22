require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { OpenAI } = require('openai');
const session = require('express-session');

const app = express();
const port = 3000;
app.use(express.json());
app.use(express.static('public'));

// Set session timeout duration in milliseconds (e.g., 30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000;  // 30 minutes

// Session management setup
app.use(session({
  secret: process.env.SESSION_SECRET,  // Use a strong secret key for session encryption
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false, // Secure cookies in production
    maxAge: SESSION_TIMEOUT,  // Session will expire after 30 minutes of inactivity
  }
}));

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: process.env.DB_PASSWORD,
  database: 'test',
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }
  console.log('Connected to the database.');
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware to check session validity for protected routes
function checkSession(req, res, next) {
  if (!req.session.email || !req.session.verified) {
    return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
  }
  next(); // Continue to the next route handler
}

// API routes
app.post('/api/check-email', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required." });
  }

  // Store email in session
  req.session.email = email;

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, message: "Internal server error." });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "Email not found in our records." });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 60000); // OTP expiration time (1 minute)

    const query = 
      `INSERT INTO otp_records (email, otp, expires_at)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE otp = ?, expires_at = ?;`;

    db.query(query, [email, otp, expiresAt, otp, expiresAt], (err) => {
      if (err) {
        console.error('Error saving OTP to database:', err);
        return res.status(500).json({ success: false, message: "Failed to save OTP." });
      }

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your OTP Code',
        text: `Your OTP code is: ${otp}. It is valid for 1 minute.`,
      };

      transporter.sendMail(mailOptions, (error) => {
        if (error) {
          console.error('Error sending email:', error);
          return res.status(500).json({ success: false, message: "Failed to send OTP." });
        }
        res.json({ success: true, message: 'OTP sent to your email address.' });
      });
    });
  });
});

app.post('/api/resend-otp', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required." });
  }

  db.query('SELECT * FROM otp_records WHERE email = ? AND expires_at > NOW()', [email], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, message: "Internal server error." });
    }

    if (results.length > 0) {
      const otpRecord = results[0];
      const otp = otpRecord.otp;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your OTP Code',
        text: `Your OTP code is: ${otp}. It is still valid for 1 minute.`,
      };

      transporter.sendMail(mailOptions, (error) => {
        if (error) {
          console.error('Error sending email:', error);
          return res.status(500).json({ success: false, message: "Failed to send OTP." });
        }
        res.json({ success: true, message: 'OTP resent to your email address.' });
      });
    } else {
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 60000); // OTP expiration time (1 minute)

      const query = 
        `INSERT INTO otp_records (email, otp, expires_at)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE otp = ?, expires_at = ?;`;

      db.query(query, [email, otp, expiresAt, otp, expiresAt], (err) => {
        if (err) {
          console.error('Error saving OTP to database:', err);
          return res.status(500).json({ success: false, message: "Failed to save OTP." });
        }

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'Your OTP Code',
          text: `Your OTP code is: ${otp}. It is valid for 1 minute.`,
        };

        transporter.sendMail(mailOptions, (error) => {
          if (error) {
            console.error('Error sending email:', error);
            return res.status(500).json({ success: false, message: "Failed to send OTP." });
          }
          res.json({ success: true, message: 'New OTP sent to your email address.' });
        });
      });
    }
  });
});

app.post('/api/verify-otp', (req, res) => {
  const { otp } = req.body;
  const email = req.session.email; // Use the email stored in session

  if (!email || !otp) {
    return res.status(400).json({ success: false, message: "Email and OTP are required." });
  }

  db.query('SELECT * FROM otp_records WHERE email = ? AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1', [email], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, message: "Internal server error." });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "OTP not found or expired." });
    }

    const otpRecord = results[0];

    if (otp !== otpRecord.otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP." });
    }

    req.session.verified = true; // Set user as verified in session
    req.session.userState = 'awaiting_domain_input'; // Store state

    // Don't clear OTP and email yet, wait until the session expires or the user completes the flow.

    // Delete OTP record after verification
    db.query('DELETE FROM otp_records WHERE email = ?', [email], (err) => {
      if (err) {
        console.error('Error deleting OTP records:', err);
      }
    });

    res.json({ success: true, message: "OTP verified successfully. Please provide a domain name for suggestions." });
  });
});

// Protected routes using the checkSession middleware
app.post('/api/domain-suggestions', checkSession, async (req, res) => {
  const { domain } = req.body;
  const email = req.session.email; // Use the email stored in session

  if (req.session.userState !== 'awaiting_domain_input') {
    return res.status(400).json({ success: false, message: "Please verify your email first." });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are an assistant that provides 10 creative domain name suggestions based on the input domain." },
        { role: "user", content: `Provide 10 domain name suggestions related to: ${domain}` },
      ],
      max_tokens: 100,
    });

    const suggestions = response.choices[0].message.content.trim();

    if (!suggestions) {
      return res.status(404).json({ success: false, message: "No suggestions found for the given domain." });
    }

    const suggestionArray = suggestions.split("\n").map(s => s.trim());

    req.session.userState = 'domain_suggested'; // Update state

    res.json({
      success: true,
      suggestions: suggestionArray,
      message: "Domain suggestions provided. Now you can ask anything!",
    });
  } catch (error) {
    console.error('Error generating domain suggestions:', error);
    res.status(500).json({ success: false, message: "Error generating suggestions." });
  }
});

app.post('/api/chat', checkSession, async (req, res) => {
  const { query } = req.body;
  const email = req.session.email; // Use the email stored in session

  if (!query) {
    return res.status(400).json({ success: false, message: "Query is required." });
  }

  if (req.session.userState !== 'domain_suggested') {
    return res.status(400).json({ success: false, message: "Please get domain suggestions first." });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: `You are an assistant helping with domain suggestions. The domain provided by the user is: ${req.session.domain}` },
        { role: "user", content: query },
      ],
      max_tokens: 150,
    });

    const botResponse = response.choices[0].message.content;

    res.json({
      success: true,
      answer: botResponse,
    });
  } catch (error) {
    console.error('Error during AI chat:', error);
    res.status(500).json({ success: false, message: "Failed to process your question." });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
