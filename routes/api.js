const express = require('express');
const router = express.Router();
const { Paste } = require('../models/paste');
const { LinkShortener } = require('../models/linkShortener');
const { validatePasteContent } = require('../utils/pasteContent');
const { validateShortUrl } = require('../utils/shortUrl');
const { validateEditCode, hashEditCode, verifyEditCode } = require('../utils/editCode');

function validatePasteInput(input) {
    const contentError = validatePasteContent(input?.content);
    if (contentError) return contentError;
    return validateEditCode(input?.editCode);
}

function isPasteId(id) {
    return /^PT[A-Za-z0-9]{8}$/.test(id);
}

router.post('/paste', async (req, res) => {
    const input = req.body || {};
    const validationError = validatePasteInput(input);
    if (validationError) {
        return res.status(validationError.status).json({ error: validationError.error });
    }

    try {
        const editCredentials = input.editCode ? await hashEditCode(input.editCode) : {};
        const paste = await Paste.create({ content: input.content, ...editCredentials });
        res.status(201).json({ id: paste.id });
    } catch (error) {
        res.status(500).json({ error: 'Unable to create paste' });
    }
});

router.post('/pastes/bulk', async (req, res) => {
    const pastes = req.body?.pastes;
    if (!Array.isArray(pastes) || pastes.length < 1 || pastes.length > 50) {
        return res.status(400).json({ error: 'Provide between 1 and 50 pastes' });
    }

    for (const paste of pastes) {
        const validationError = validatePasteInput(paste);
        if (validationError) {
            return res.status(validationError.status).json({ error: validationError.error });
        }
    }

    try {
        const records = [];
        for (const paste of pastes) {
            records.push({
                content: paste.content,
                ...(paste.editCode ? await hashEditCode(paste.editCode) : {})
            });
        }
        const created = await Paste.insertMany(records);
        res.status(201).json({ pastes: created.map((paste) => ({ id: paste.id })) });
    } catch (error) {
        res.status(500).json({ error: 'Unable to create pastes' });
    }
});

router.post('/paste/:id/edit', async (req, res) => {
    if (!isPasteId(req.params.id)) return res.status(404).json({ error: 'Paste not found' });

    const input = req.body || {};
    const contentError = validatePasteContent(input.content);
    if (contentError) return res.status(contentError.status).json({ error: contentError.error });
    const editCodeError = validateEditCode(input.editCode);
    if (editCodeError) return res.status(editCodeError.status).json({ error: editCodeError.error });

    try {
        const paste = await Paste.findById(req.params.id).select('+editCodeSalt +editCodeHash');
        if (!paste) return res.status(404).json({ error: 'Paste not found' });
        if (!paste.editCodeHash) return res.status(403).json({ error: 'This paste does not have an edit code' });
        if (!await verifyEditCode(input.editCode, paste.editCodeSalt, paste.editCodeHash)) {
            return res.status(403).json({ error: 'Edit code is incorrect' });
        }

        paste.content = input.content;
        await paste.save();
        res.json({ id: paste.id, updated: true });
    } catch (error) {
        res.status(500).json({ error: 'Unable to update paste' });
    }
});

router.post('/shorten', async (req, res) => {
    const { originalUrl } = req.body || {};
    const validationError = validateShortUrl(originalUrl);
    if (validationError) {
        return res.status(validationError.status).json({ error: validationError.error });
    }

    try {
        const shortLink = await LinkShortener.create({ originalUrl: new URL(originalUrl.trim()).toString() });
        res.status(201).json({ id: shortLink.id, shortUrl: `/${shortLink.id}` });
    } catch (error) {
        res.status(500).json({ error: 'Unable to shorten URL' });
    }
});

router.get('/paste/:id/views', async (req, res) => {
    if (!/^PT[A-Za-z0-9]{8}$/.test(req.params.id)) {
        return res.status(404).json({ error: 'Paste not found' });
    }

    try {
        const paste = await Paste.findById(req.params.id).select('views');
        if (!paste) return res.status(404).json({ error: 'Paste not found' });
        res.json({ views: paste.views });
    } catch (error) {
        res.status(500).json({ error: 'Unable to retrieve paste views' });
    }
});

module.exports = router;
