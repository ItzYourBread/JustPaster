const axios = require('axios'); // Axios is used for making HTTP requests
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3000}/api/shorten`;

// Function to create a shortened URL
async function createShortenedUrl(originalUrl) {
    try {
        const response = await axios.post(BASE_URL, { originalUrl });
        console.log(`Original URL: ${originalUrl}`);
        console.log(`Shortened URL ID: ${response.data.shortUrl}`);
    } catch (error) {
        console.error('Error creating shortened URL:', error.response?.data || error.message);
    }
}

// Test cases
(async () => {
    await createShortenedUrl('https://example.com');
    await createShortenedUrl('https://google.com');
    await createShortenedUrl('https://github.com');
})();
