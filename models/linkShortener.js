const mongoose = require('mongoose');

// Generate a random ID of 6 characters, prefixed with "LS"
function generateLinkId(length) {
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'LS'; 
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

const linkShortenerSchema = new mongoose.Schema({
    _id: { type: String, default: () => generateLinkId(8) },
    originalUrl: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    clickCount: { type: Number, default: 0 }
}, { _id: false });

const LinkShortener = mongoose.model('LinkShortener', linkShortenerSchema);

module.exports = { LinkShortener };
