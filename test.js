const mongoose = require('mongoose');

// MongoDB connection URL
const mongoUri = 'mongodb+srv://arifsatify:yC0FRMMC5lfBXf1D@justpaster.5cbklku.mongodb.net/?retryWrites=true&w=majority&appName=JustPaster';

// Paste schema and model
const pasteSchema = new mongoose.Schema({
    _id: String, // Existing _id field as a string
    content: String,
    createdAt: { type: Date, default: Date.now },
    views: { type: Number, default: 0 },
    antiBypass: { type: Boolean, default: false },
    redirectUrl: { type: String, default: '' }
});

const Paste = mongoose.model('Paste', pasteSchema);

(async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log("Connected to MongoDB");

        // Find all pastes that do not already have the "PT" prefix
        const pastes = await Paste.find({ _id: { $not: /^PT/ } });

        // Loop through and update each paste ID by creating a new document and deleting the old one
        for (let paste of pastes) {
            const newId = `PT${paste._id}`; // Add "PT" prefix to the existing _id
            console.log(`Updating paste ID: ${paste._id} -> ${newId}`);

            // Create a new paste with the same data but with the new _id
            const newPaste = new Paste({
                _id: newId,
                content: paste.content,
                createdAt: paste.createdAt,
                views: paste.views,
                antiBypass: paste.antiBypass,
                redirectUrl: paste.redirectUrl
            });

            // Save the new paste
            await newPaste.save();

            // Delete the old paste
            await Paste.deleteOne({ _id: paste._id });
        }

        console.log("All pastes updated successfully");
        await mongoose.disconnect();
    } catch (error) {
        console.error("Error updating pastes:", error);
    }
})();
