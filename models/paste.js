const mongoose = require('mongoose');
const { randomInt } = require('crypto');

const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generatePasteId() {
    let id = 'PT';
    for (let index = 0; index < 8; index++) {
        id += characters[randomInt(characters.length)];
    }
    return id;
}

const pasteSchema = new mongoose.Schema({
    _id: { type: String, default: generatePasteId },
    content: { type: String, required: true },
    editCodeSalt: { type: String, select: false },
    editCodeHash: { type: String, select: false },
    createdAt: { type: Date, default: Date.now },
    views: { type: Number, default: 0 }
}, { _id: false });

const Paste = mongoose.model('Paste', pasteSchema);

module.exports = { Paste, generatePasteId };
