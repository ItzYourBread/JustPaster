const Paste = require('../models/paste');

const allowedReferrers = [
    'https://watchnsfw.co',
    'https://tavernleaks.com',
    'https://best-links.org',
    'https://hentai-leaks.com',
    'https://free-leaks.com',
    'https://kmendation.com',
    'https://linkvertise.com'
];

module.exports = async (req, res, next) => {
    const referrer = req.get('Referrer') || '';
    const paste = await Paste.findById(req.params.id);

    if (paste && paste.antiBypass) {
        const isAllowed = allowedReferrers.some(allowed => referrer.startsWith(allowed));
        if (!isAllowed) {
            return res.redirect(paste.redirectUrl || `https://justpaster.lol/${req.params.id}`);
        }
    }
    next();
};
