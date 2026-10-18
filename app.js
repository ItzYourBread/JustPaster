require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', indexRouter);
app.use('/api', apiRouter);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).send('Page not found');
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  const status = error.type === 'entity.too.large' ? 413
    : error.type === 'entity.parse.failed' ? 400
      : 500;
  if (status >= 500) console.error(error);
  const message = status === 413 ? 'Request is too large'
    : status === 400 ? 'Invalid request body'
      : 'Something went wrong';

  if (req.path.startsWith('/api/')) {
    return res.status(status).json({ error: message });
  }
  res.status(status).send(message);
});

async function start() {
  if (!process.env.MONGO_URL) {
    throw new Error('MONGO_URL must be set before starting JustPaster');
  }

  await mongoose.connect(process.env.MONGO_URL);
  console.log('Connected to database');

  return app.listen(port, () => {
    console.log(`JustPaster running at http://localhost:${port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Unable to start JustPaster:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, start };
