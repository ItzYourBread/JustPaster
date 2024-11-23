require('dotenv').config(); // For loading environment variables
const mongoose = require('mongoose');
const { Paste } = require('./models/paste');

// Connect to the database
mongoose.connect(process.env.MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Database connected successfully'))
    .catch(err => console.error('Database connection error:', err));

// Fetch and display the latest created paste ID
async function getLatestPasteId() {
    try {
        const latestPaste = await Paste.findOne().sort({ createdAt: -1 }).exec();
        if (latestPaste) {
            console.log('Latest Paste ID:', latestPaste._id);
        } else {
            console.log('No pastes found.');
        }
    } catch (err) {
        console.error('Error fetching latest paste ID:', err);
    } finally {
        mongoose.connection.close(); // Close the connection after the query
    }
}

// Execute the function
getLatestPasteId();
