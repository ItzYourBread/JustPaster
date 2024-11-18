const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const app = express();

// Import routes
const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');

dotenv.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/cdn', express.static(path.join(__dirname, 'cdn')));

mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log("Connected to DB"))
    .catch((err) => { throw err; });

// Routes
app.use('/', indexRouter); // Public-facing routes
app.use('/api', apiRouter); // API routes

app.listen(process.env.PORT, () => {
    console.log(`Server running at http://localhost:${process.env.PORT}`);
});
