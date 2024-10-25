const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { marked } = require('marked');
const highlightjs = require('highlight.js');
const dotenv = require("dotenv");
const path = require("path"); // Import path module for handling file paths
const app = express();

dotenv.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // for parsing application/json
app.set('view engine', 'ejs');
app.use(express.static('public')); // for serving static CSS and JS
app.use('/cdn', express.static(path.join(__dirname, 'cdn')));

mongoose
    .connect(process.env.MONGO_URL)
    .then(() => {
        console.log("Connected to DB");
    })
    .catch((err) => {
        throw err;
    });

// Generate a random ID of 6 characters, prefixed with "PT"
function generateId(length) {
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'PT'; // Prefix with "PT"
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}


// Paste schema and model
const pasteSchema = new mongoose.Schema({
    _id: { type: String, default: () => generateId(8) }, // Use generated ID as _id
    content: String,
    createdAt: { type: Date, default: Date.now },
    views: { type: Number, default: 0 },
    antiBypass: { type: Boolean, default: false },
    redirectUrl: { type: String, default: '' }
}, { _id: false }); // Prevent Mongoose from adding a default _id

const Paste = mongoose.model('Paste', pasteSchema);

// Configure marked to use highlight.js
marked.setOptions({
    highlight: function (code, lang) {
        const language = highlightjs.getLanguage(lang) ? lang : 'plaintext';
        return highlightjs.highlight(code, { language }).value;
    }
});

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


// Routes
app.get('/', (req, res) => {
    res.render('index');
});

app.post('/', async (req, res) => {
    const newPaste = new Paste({ content: req.body.content });
    await newPaste.save();
    res.redirect(`/${newPaste.id}`);
});

// Route to handle redirection for both short links and pastes
app.get('/:id', async (req, res) => {
    const { id } = req.params;

    if (id.startsWith('LS')) {
        // Handle Link Shortener
        const shortenedUrl = await LinkShortener.findById(id); 

        if (shortenedUrl) {
            // Increment click count
            shortenedUrl.clickCount++;
            await shortenedUrl.save();

            // Redirect to the original URL
            res.redirect(shortenedUrl.originalUrl);
        } else {
            res.status(404).send('Shortened URL not found');
        }
    } else if (id.startsWith('PT')) {
        // Handle Paste
        const paste = await Paste.findById(id);

        if (paste) {
            paste.views++;
            await paste.save();

            res.render('paste', { paste: paste, content: marked(paste.content) });
        } else {
            res.status(404).send('Paste not found');
        }
    } else {
        // Handle invalid ID format
        res.status(400).send('Invalid ID format');
    }
});

// REST API for creating pastes
app.post('/api/paste', async (req, res) => {
    const newPaste = new Paste({ content: req.body.content });
    await newPaste.save();
    res.json({ id: newPaste.id });
});

// REST API for retrieving paste views
app.get('/api/paste/:id/views', async (req, res) => {
    const paste = await Paste.findById(req.params.id);
    if (paste) {
        res.json({ views: paste.views });
    } else {
        res.status(404).send('Paste not found');
    }
});

// REST API to enable/disable anti-bypass and set redirect URL
app.post('/api/paste/:id/anti-bypass', async (req, res) => {
    const paste = await Paste.findById(req.params.id);
    if (paste) {
        paste.antiBypass = req.body.antiBypass;
        paste.redirectUrl = req.body.redirectUrl;
        await paste.save();
        res.json({ message: 'Anti-bypass settings updated' });
    } else {
        res.status(404).send('Paste not found');
    }
});

// Generate a random ID of 6 characters, prefixed with "PT"
function generateLinkId(length) {
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'LS'; // Prefix with "PT"
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// Link Shortener Schema and Model
const linkShortenerSchema = new mongoose.Schema({
    _id: { type: String, default: () => generateLinkId(8) },
    originalUrl: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    clickCount: { type: Number, default: 0 }
}, { _id: false });

const LinkShortener = mongoose.model('LinkShortener', linkShortenerSchema);

// Route to shorten any URL
app.post('/api/shorten', async (req, res) => {
    const { originalUrl } = req.body;

    if (!originalUrl) {
        return res.status(400).json({ error: 'Original URL is required' });
    }

    // Save the original URL with a generated short ID
    const shortenedUrl = new LinkShortener({ originalUrl });
    await shortenedUrl.save();

    // Respond with the shortened URL
    const shortUrl = `${shortenedUrl._id}`;
    res.json({ shortUrl });
});


app.listen(process.env.PORT, () => {
    console.log(`Server running at http://localhost:${process.env.PORT}`);
});
