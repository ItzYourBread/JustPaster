const express = require('express');
const router = express.Router();
const { LinkShortener } = require('../models/linkShortener');
const { Paste } = require('../models/paste');
const PremiumKey = require('../models/premiumKey');
const rewardsConfig = require('../rewardsConfig.json');
const { marked } = require('marked');
const crypto = require('crypto');


// Helper function to generate a random key
function generatePremiumKey() {
    return crypto.randomBytes(16).toString('hex'); // Generates a 32-character random key
}

// Routes
router.get('/', (req, res) => {
    res.render('index');
});

// Step 1: Validate initial access
router.get('/getKey/:serverName/step1', async (req, res) => {
    const { serverName } = req.params;
    const config = rewardsConfig[serverName];

    if (!config) {
        return res.status(404).send('Invalid server name');
    }

    const referrer = req.get('Referrer') || '';
    if (!referrer.startsWith(config.domain)) {
        // Referrer validation failed, redirect to 1of2 URL
        return res.redirect(config['1of2']);
    }

    // Proceed to step 2
    res.redirect(`/getKey/${serverName}/step2`);
});

// Step 2: Validate completion and generate key
router.get('/getKey/:serverName/step2', async (req, res) => {
    const { serverName } = req.params;
    const config = rewardsConfig[serverName];

    if (!config) {
        return res.status(404).send('Invalid server name');
    }

    const referrer = req.get('Referrer') || '';
    if (!referrer.startsWith(config.domain)) {
        // Referrer validation failed, redirect to 2of2 URL
        return res.redirect(config['2of2']);
    }

    // Generate and store the premium key
    const generatedKey = generatePremiumKey();
    const newKey = new PremiumKey({ serverName, generatedKey });
    await newKey.save();

    // Redirect to granted route with the generated key
    res.redirect(`/getKey/${serverName}/granted?key=${generatedKey}`);
});

// Step 3: Display the generated key
router.get('/getKey/:serverName/granted', async (req, res) => {
    const { serverName } = req.params;
    const { key } = req.query;

    const config = rewardsConfig[serverName];
    if (!config) {
        return res.status(404).send('Invalid server name');
    }

    const existingKey = await PremiumKey.findOne({ serverName, generatedKey: key });
    if (!existingKey) {
        return res.status(404).send('Invalid or expired key');
    }

    res.render('granted', { key });
});


// Route to handle redirection for both short links and pastes
router.get('/:id', async (req, res) => {
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

module.exports = router;
