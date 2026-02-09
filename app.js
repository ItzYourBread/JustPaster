const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors');
const cron = require('node-cron');
const { Paste } = require('./models/paste');
const axios = require('axios');
const app = express();

// Import routes
const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');

dotenv.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/cdn', express.static(path.join(__dirname, 'cdn')));

const allowedOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'https://justpaster.xyz',
  'https://watchnsfw.com',
  'https://www.watchnsfw.com'
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST'],
  credentials: true
}));

const allowedReferrers = [
  'https://watchnsfw.co',
  'https://tavernleaks.com',
  'https://best-links.org',
  'https://hentai-leaks.com',
  'https://free-leaks.com',
  'https://kmendation.com',
  'https://linkvertise.com',
  'https://tonordersitye.com',
  'https://bleleadersto.com',
  'https://daughablelea.com',
  'https://lockr.so'
];

// Middleware to check the referrer
// app.use('/:id', async (req, res, next) => {
//     const referrer = req.get('Referrer') || '';
//     const paste = await Paste.findById(req.params.id);

//     if (paste && paste.antiBypass) {
//         Check if the referrer is in the allowed list
//         for (const allowedReferrer of allowedReferrers) {
//             if (referrer.startsWith(allowedReferrer)) {
//                 return next();
//             }
//         }

//         // If referrer is not in the allowed list, redirect to the specified redirect URL
//         return res.redirect(paste.redirectUrl || `https://justpaster.xyz/${req.params.id}`);
//     }

//     next();
// });

mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("Connected to DB"))
  .catch((err) => { throw err; });

// Routes
app.use('/', indexRouter); // Public-facing routes
app.use('/api', apiRouter); // API routes
app.use('/api/watchnsfw', require('./routes/articles.route')); // Articles routes

const WEBHOOKS = [
  'https://discord.com/api/webhooks/1448627617174650973/DOTQfRm5XZLNQ89xhau1iiQOOiDI1DL6k7dTgX5sM9CRV3sen5IIAEORp6gBUTst-bqO', // Avaritia  
  'https://discord.com/api/webhooks/1470384704699236362/LPKIvolEzob4h5Z4SkdXGmQLE-m5G8ZuKW6LOkT7zrp3fPZzEVehcpOXMyFjlqhFPhF-', // HotBunny
  'https://discord.com/api/webhooks/1470384843383640130/DzSUfQ8azl5URr5NmeBuDllRbeZmeZlOAjf83eRyc9a7rowRa5fkRBowB4Rutk7bS5x-' // WatchNSFW
];

const API_BASE = 'https://xvidapi.com/api.php/provide/vod?ac=detail&ids=';

// Function to generate random video ID
function getRandomVideoId() {
  return Math.floor(Math.random() * 1106945) + 1; // 1 - 1106945
}

// Function to check if a video is "white/legal XX"
function isValidVideo(video) {
  const forbiddenCountries = [
    'India', 'Pakistan', 'Bangladesh', 'Desi', 'Indian', 'Pakistani', 'Bangladeshi',
    'South Asian', 'Middle Eastern', 'Arab', , 'Iranian', 'Afghan', 'Central Asian',
    'Southeast Asian', 'Malay', 'Sri Lankan',
    'Nepalese', 'Bhutanese', 'Malaysian', 'Burmese', 'Cambodian', 'Laotian', 'Myanmar', 'Bruneian',
    'Timorese', 'Mongolian', 'Kazakh', 'Uzbek', 'Turkmen', 'Kyrgyz',
    'Gay', 'Lesbian', 'Transgender', 'LGBT', 'Queer', 'Bisexual', 'Pansexual', 'Asexual',
    'Non-binary', 'Genderqueer', 'Intersex', 'Two-Spirit', 'Drag', 'Crossdresser'
  ];
  const videoCountry = video.country?.[0]?.toLowerCase() || '';
  return !forbiddenCountries.some(c => videoCountry.includes(c.toLowerCase()));
}

// Fetch random video and send to ALL Discord webhooks
async function fetchAndSend() {
  try {
    let video;
    let attempts = 0;

    while (!video && attempts < 10) { // Try max 10 times to find valid video
      const id = getRandomVideoId();
      const res = await axios.get(`${API_BASE}${id}`);
      const list = res.data.list || [];

      if (list.length && isValidVideo(list[0])) {
        video = list[0];
      }

      attempts++;
    }

    if (!video) return console.log('No valid video found after 10 attempts');

    // Prepare Discord message
    const discordData = {
      content: `https://www.watchnsfw.com/watch?id=${video.id}`
    };

    // Send to ALL webhooks
    for (let i = 0; i < WEBHOOKS.length; i++) {
      await axios.post(WEBHOOKS[i], discordData);
      console.log(`Uploaded video ${video.id} to Discord via webhook #${i + 1}`);
    }

  } catch (err) {
    console.error('Error fetching/sending video:', err.message);
  }
}

// ⚡ Cron job: run every 5 seconds
// Syntax: 'second minute hour day month weekday'
// ⚡ Cron job: run every 5 minutes
// This runs at minute 0, 5, 10, 15, ..., 55 of every hour
cron.schedule('*/10 * * * *', () => {
  fetchAndSend();
  console.log('Cron job triggered at', new Date().toLocaleTimeString());
});

// Optional: run immediately on start
fetchAndSend();

app.listen(process.env.PORT, () => {
  console.log(`Server running at http://localhost:${process.env.PORT}`);
});
