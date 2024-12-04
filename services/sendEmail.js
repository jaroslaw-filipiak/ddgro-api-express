const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmail(emailOptions) {
  try {
    // Set up handlebars template engine
    const templatePath = path.resolve('./views/emails');
    const templateContent = fs.readFileSync(
      path.join(templatePath, emailOptions.template + '.handlebars'),
      'utf8',
    );

    // Compile template with handlebars
    const template = handlebars.compile(templateContent);
    const htmlContent = template(emailOptions.context);

    // Prepare attachments
    const attachments = [];
    if (emailOptions.attachments && emailOptions.attachments.length > 0) {
      for (const attachment of emailOptions.attachments) {
        // Read file as Buffer instead of converting to base64 string
        const content = await fs.promises.readFile(attachment.path);
        attachments.push({
          content: content.toString('base64'),
          filename: attachment.filename,
          type: attachment.contentType,
          disposition: 'attachment',
        });
      }
    }

    const msg = {
      to: emailOptions.to,
      from: emailOptions.from,
      subject: emailOptions.subject,
      html: htmlContent,
      attachments: attachments,
    };

    // Send email using SendGrid
    await sgMail.send(msg);
    console.log('Email sent successfully via SendGrid');

    // Clean up any temporary files if they exist
    if (emailOptions.attachments) {
      for (const attachment of emailOptions.attachments) {
        if (attachment.path && fs.existsSync(attachment.path)) {
          await fs.promises.unlink(attachment.path);
        }
      }
    }
  } catch (error) {
    console.error('Failed to send email via SendGrid:', error);
    if (error.response) {
      console.error('SendGrid error details:', error.response.body);
    }
    throw error;
  }
}

module.exports = sendEmail;
