// models/premiumKey.js
const mongoose = require('mongoose');

const premiumKeySchema = new mongoose.Schema({
    serverName: { type: String, required: true },
    generatedKey: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('PremiumKey', premiumKeySchema);
