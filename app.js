var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var dotenv = require("dotenv").config();
var mongoose = require("mongoose");

var indexRouter = require("./routes/index");
var apiUsersRouter = require("./routes/api/users");

mongoose.connect(process.env.MONGODB_URI);

var app = express();

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/api/users", apiUsersRouter);

module.exports = app;
