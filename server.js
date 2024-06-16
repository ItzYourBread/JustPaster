const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { marked } = require('marked');
const highlightjs = require('highlight.js');
const dotenv = require("dotenv");
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // for parsing application/json
app.set('view engine', 'ejs');
app.use(express.static('public')); // for serving static CSS and JS

dotenv.config();

mongoose
    .connect(process.env.MONGO_URL)
    .then(() => {
        console.log("Connected to DB");
    })
    .catch((err) => {
        throw err;
    });

// Generate a random ID of 6 characters
function generateId(length) {
  const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Paste schema and model
const pasteSchema = new mongoose.Schema({
  _id: { type: String, default: () => generateId(6) }, // Use generated ID as _id
  content: String,
  createdAt: { type: Date, default: Date.now },
  views: { type: Number, default: 0 }
}, { _id: false }); // Prevent Mongoose from adding a default _id

const Paste = mongoose.model('Paste', pasteSchema);

// Configure marked to use highlight.js
marked.setOptions({
  highlight: function(code, lang) {
    const language = highlightjs.getLanguage(lang) ? lang : 'plaintext';
    return highlightjs.highlight(code, { language }).value;
  }
});

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.post('/', async (req, res) => {
  const newPaste = new Paste({ content: req.body.content });
  await newPaste.save();
  res.redirect(`/${newPaste.id}`);
});

app.get('/:id', async (req, res) => {
  const paste = await Paste.findById(req.params.id);
  if (paste) {
    paste.views++;
    await paste.save();
    res.render('paste', { paste: paste, content: marked(paste.content) });
  } else {
    res.status(404).send('Paste not found');
  }
});

// REST API for creating pastes
app.post('/api/paste', async (req, res) => {
  const newPaste = new Paste({ content: req.body.content });
  await newPaste.save();
  res.json({ id: newPaste.id });
});

// REST API for retrieving paste views
app.get('/api/paste/:id/views', async (req, res) => {
  const paste = await Paste.findById(req.params.id);
  if (paste) {
    res.json({ views: paste.views });
  } else {
    res.status(404).send('Paste not found');
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server running at http://localhost:${process.env.PORT}`);
});
