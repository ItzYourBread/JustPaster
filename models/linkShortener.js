const mongoose = require('mongoose');
const { randomInt } = require('crypto');

const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateShortLinkId() {
    let id = 'LS';
    for (let index = 0; index < 8; index++) {
        id += characters[randomInt(characters.length)];
    }
    return id;
}

const linkShortenerSchema = new mongoose.Schema({
    _id: { type: String, default: generateShortLinkId },
    originalUrl: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    clickCount: { type: Number, default: 0 }
}, { _id: false });

const LinkShortener = mongoose.model('LinkShortener', linkShortenerSchema);

module.exports = { LinkShortener, generateShortLinkId };
