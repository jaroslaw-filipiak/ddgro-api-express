var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var dotenv = require('dotenv').config();
var mongoose = require('mongoose');
var cors = require('cors');

var indexRouter = require('./routes/index');
var apiUsersRouter = require('./routes/api/users');
var apiAccesoriesRouter = require('./routes/api/accesories');
var apiAProductsRouter = require('./routes/api/products');
var apiApplicationsRouter = require('./routes/api/application');

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

var app = express();
app.use(express.json({ limit: '50mb' }));

app.use(cors(corsOptions));
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/api/users', apiUsersRouter);
app.use('/api/accesories', apiAccesoriesRouter);
app.use('/api/products', apiAProductsRouter);
app.use('/api/application', apiApplicationsRouter);

module.exports = app;
