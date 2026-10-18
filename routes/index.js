const express = require('express');
const router = express.Router();
const { Paste } = require('../models/paste');
const { LinkShortener } = require('../models/linkShortener');
const { validateShortUrl } = require('../utils/shortUrl');
const siteUrl = new URL(process.env.SITE_URL || 'https://justpaster.co').origin;

router.get('/', (req, res) => {
    res.render('index', { siteUrl });
});

router.get('/robots.txt', (req, res) => {
    res.type('text/plain').send([
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        `Sitemap: ${siteUrl}/sitemap.xml`
    ].join('\n'));
});

router.get('/sitemap.xml', (req, res) => {
    res.type('application/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        `<url><loc>${siteUrl}/</loc></url>` +
        '</urlset>'
    );
});

router.get('/:id', async (req, res, next) => {
    if (/^LS[A-Za-z0-9]{8}$/.test(req.params.id)) {
        try {
            const shortLink = await LinkShortener.findByIdAndUpdate(
                req.params.id,
                { $inc: { clickCount: 1 } },
                { new: true }
            );

            if (!shortLink) return res.status(404).send('Short link not found');
            if (validateShortUrl(shortLink.originalUrl)) {
                return res.status(410).send('This short link is unavailable');
            }
            return res.redirect(302, new URL(shortLink.originalUrl).toString());
        } catch (error) {
            return next(error);
        }
    }

    if (!/^PT[A-Za-z0-9]{8}$/.test(req.params.id)) {
        return res.status(404).send('Paste not found');
    }

    try {
        const paste = await Paste.findByIdAndUpdate(
            req.params.id,
            { $inc: { views: 1 } },
            { new: true }
        ).select('+editCodeHash');

        if (!paste) return res.status(404).send('Paste not found');
        res.set('X-Robots-Tag', 'noindex, follow');
        res.render('paste', { paste, canEdit: Boolean(paste.editCodeHash), siteUrl });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
