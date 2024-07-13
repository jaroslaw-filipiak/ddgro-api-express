const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const hbs = require('nodemailer-express-handlebars');

const emailTransporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: true,
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD,
  },
});

// Configure template engine and specify the path to templates
const handlebarOptions = {
  viewEngine: {
    extName: '.handlebars',
    partialsDir: path.resolve('./views/emails'),
    defaultLayout: false,
  },
  viewPath: path.resolve('./views/emails'),
  extName: '.handlebars',
};

emailTransporter.use('compile', hbs(handlebarOptions));

async function sendEmail(emailOptions) {
  try {
    await emailTransporter.sendMail(emailOptions);
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Failed to send email', error);
  }
}

module.exports = sendEmail;
