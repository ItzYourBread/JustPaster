const mongoose = require('mongoose');

// MongoDB connection URL
const mongoUri = 'mongodb+srv://arifsatify:yC0FRMMC5lfBXf1D@justpaster.5cbklku.mongodb.net/?retryWrites=true&w=majority&appName=JustPaster';

// Generate a random ID of 6 characters, prefixed with "LS"
function generateLinkId(length) {
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'LS'; // Prefix with "LS"
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// Link Shortener Schema and Model
const linkShortenerSchema = new mongoose.Schema({
    _id: { type: String, default: () => generateLinkId(8) },
    originalUrl: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    clickCount: { type: Number, default: 0 }
}, { _id: false });

const LinkShortener = mongoose.model('LinkShortener', linkShortenerSchema);

(async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log("Connected to MongoDB");

        // Find all link shorteners that do not already have the "LS" prefix
        const linkShorteners = await LinkShortener.find({ _id: { $not: /^LS/ } });

        // Loop through and update each link shortener by creating a new document and deleting the old one
        for (let link of linkShorteners) {
            const newId = `LS${link._id}`; // Add "LS" prefix to the existing _id
            console.log(`Updating link shortener ID: ${link._id} -> ${newId}`);

            // Create a new link shortener with the same data but with the new _id
            const newLink = new LinkShortener({
                _id: newId,
                originalUrl: link.originalUrl,
                createdAt: link.createdAt,
                clickCount: link.clickCount
            });

            // Save the new link shortener
            await newLink.save();

            // Delete the old link shortener
            await LinkShortener.deleteOne({ _id: link._id });
        }

        console.log("All link shorteners updated successfully");
        await mongoose.disconnect();
    } catch (error) {
        console.error("Error updating link shorteners:", error);
    }
})();
