const express = require('express');
const router = express.Router();
const { LinkShortener } = require('../models/linkShortener');
const { Paste } = require('../models/paste');
const { marked } = require('marked');


// Routes
router.get('/', (req, res) => {
    res.render('index');
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
