const express = require('express');
const router = express.Router();
const { Paste } = require('../models/paste');
const { LinkShortener } = require('../models/linkShortener');
const PremiumKey = require('../models/premiumKey');

// API to check the validity of a premium key
router.get('/getKey/:serverName/check', async (req, res) => {
    const { serverName } = req.params;
    const { key } = req.query;

    if (!key) {
        return res.status(400).json({ error: 'Key is required' });
    }

    const existingKey = await PremiumKey.findOne({ serverName, generatedKey: key });
    if (existingKey) {
        res.json({ valid: true, message: 'Key is valid' });
    } else {
        res.status(400).json({ valid: false, message: 'Key is invalid or not found' });
    }
});

// API to remove a premium key
router.delete('/getKey/:serverName/remove', async (req, res) => {
    const { serverName } = req.params;
    const { key } = req.body;

    if (!key) {
        return res.status(400).json({ error: 'Key is required' });
    }

    const deletedKey = await PremiumKey.findOneAndDelete({ serverName, generatedKey: key });

    if (deletedKey) {
        res.json({ success: true, message: 'Key successfully removed' });
    } else {
        res.status(404).json({ success: false, message: 'Key not found' });
    }
});

// REST API for creating pastes
router.post('/paste', async (req, res) => {
    const newPaste = new Paste({ content: req.body.content });
    await newPaste.save();
    res.json({ id: newPaste.id });
});

// REST API for retrieving paste views
router.get('/paste/:id/views', async (req, res) => {
    const paste = await Paste.findById(req.params.id);
    if (paste) {
        res.json({ views: paste.views });
    } else {
        res.status(404).send('Paste not found');
    }
});

// REST API to enable/disable anti-bypass and set redirect URL
router.post('/paste/:id/anti-bypass', async (req, res) => {
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

// Route to shorten any URL
router.post('/shorten', async (req, res) => {
    const { originalUrl } = req.body;

    if (!originalUrl) {
        return res.status(400).json({ error: 'Original URL is required' });
    }

    const shortenedUrl = new LinkShortener({ originalUrl });
    await shortenedUrl.save();

    const shortUrl = `${shortenedUrl._id}`;
    res.json({ shortUrl });
});

module.exports = router;
