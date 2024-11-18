const mongoose = require('mongoose');

// Generate a random ID of 6 characters, prefixed with "PT"
function generateId(length) {
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'PT'; 
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

const pasteSchema = new mongoose.Schema({
    _id: { type: String, default: () => generateId(8) },
    content: String,
    createdAt: { type: Date, default: Date.now },
    views: { type: Number, default: 0 },
    antiBypass: { type: Boolean, default: false },
    redirectUrl: { type: String, default: '' }
}, { _id: false });

const Paste = mongoose.model('Paste', pasteSchema);

module.exports = { Paste };
