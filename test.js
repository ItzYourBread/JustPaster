const axios = require('axios');

// Base URL for your server
const BASE_URL = 'http://localhost:3000/api';

// Server name for testing
const SERVER_NAME = 'WatchNSFW';

// Example premium key for testing
const TEST_KEY = 'example-premium-key';

// Function to test the check API
async function testCheckKey() {
    try {
        const response = await axios.get(`${BASE_URL}/getKey/${SERVER_NAME}/check`, {
            params: { key: TEST_KEY }
        });
        console.log('Check API Response:', response.data);
    } catch (error) {
        if (error.response) {
            console.error('Check API Error:', error.response.data);
        } else {
            console.error('Check API Network Error:', error.message);
        }
    }
}

// Function to test the remove API
async function testRemoveKey() {
    try {
        const response = await axios.delete(`${BASE_URL}/getKey/${SERVER_NAME}/remove`, {
            data: { key: TEST_KEY }
        });
        console.log('Remove API Response:', response.data);
    } catch (error) {
        if (error.response) {
            console.error('Remove API Error:', error.response.data);
        } else {
            console.error('Remove API Network Error:', error.message);
        }
    }
}

// Run the tests
(async function runTests() {
    console.log('Testing Check API...');
    await testCheckKey();

    console.log('\nTesting Remove API...');
    await testRemoveKey();
})();
