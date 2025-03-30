const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const dotenv = require('dotenv').config();
const mongoose = require('mongoose');
const cors = require('cors');
const passport = require('./config/passport');

const indexRouter = require('./routes/index');
const apiUsersRouter = require('./routes/api/users');
const apiAccesoriesRouter = require('./routes/api/accesories');
const apiAProductsRouter = require('./routes/api/products');
const apiApplicationsRouter = require('./routes/api/application');
const apiAuthRouter = require('./routes/api/auth');

const allowedOrigins =
  process.env.NODE_ENV === 'development'
    ? '*'
    : [
        'http://localhost:3000',
        'https://kalkulator.ddgro.eu',
        'https://ddgro-form-git-feature-front-964842-jaroslawfilipiaks-projects.vercel.app',
      ];

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
};

mongoose.connect(process.env.MONGODB_URI);

const app = express();

app.use(express.json({ limit: '50mb' }));

app.use(cors(corsOptions));
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(passport.initialize());

app.use('/', indexRouter);
app.use('/api/auth', apiAuthRouter);
app.use('/api/users', apiUsersRouter);
app.use('/api/accesories', apiAccesoriesRouter);
app.use('/api/products', apiAProductsRouter);
app.use('/api/application', apiApplicationsRouter);

module.exports = app;
