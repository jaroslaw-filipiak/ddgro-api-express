const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

async function sendEmail(to, subject, templateName, replacements) {
  let transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: true,
    auth: {
      user: process.env.MAIL_USERNAME,
      pass: process.env.MAIL_PASSWORD,
    },
  });

  // Read the email template
  const templatePath = path.join(
    __dirname,
    '../views/emails',
    `${templateName}.html`,
  );
  let html = fs.readFileSync(templatePath, 'utf8');

  // Read and replace placeholders in the template
  for (const key in replacements) {
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), replacements[key]);
  }

  // Send mail with defined transport object
  let info = await transporter.sendMail({
    from: '"DDGRO" <info@j-filipiak.pl>',
    to: to,
    subject: subject,
    html: html,
  });

  console.log('Message sent: %s', info.messageId);
}

module.exports = sendEmail;
