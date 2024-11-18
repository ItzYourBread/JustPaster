const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
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

const allowedReferrers = [
    'https://watchnsfw.co',
    'https://tavernleaks.com',
    'https://best-links.org',
    'https://hentai-leaks.com',
    'https://free-leaks.com',
    'https://kmendation.com',
    'https://linkvertise.com'
];

// Middleware to check the referrer
app.use('/:id', async (req, res, next) => {
    const referrer = req.get('Referrer') || '';
    const paste = await Paste.findById(req.params.id);

    if (paste && paste.antiBypass) {
        // Check if the referrer is in the allowed list
        for (const allowedReferrer of allowedReferrers) {
            if (referrer.startsWith(allowedReferrer)) {
                return next();
            }
        }

        // If referrer is not in the allowed list, redirect to the specified redirect URL
        return res.redirect(paste.redirectUrl || `https://justpaster.lol/${req.params.id}`);
    }

    next();
});

mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log("Connected to DB"))
    .catch((err) => { throw err; });

// Routes
app.use('/', indexRouter); // Public-facing routes
app.use('/api', apiRouter); // API routes

app.listen(process.env.PORT, () => {
    console.log(`Server running at http://localhost:${process.env.PORT}`);
});
