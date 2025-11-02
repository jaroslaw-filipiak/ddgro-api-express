const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');

handlebars.registerHelper('eq', function (a, b) {
  return a === b;
});

handlebars.registerHelper('getTypeName', function (type) {
  return type === 'slab' ? 'Płyty' : 'Deski';
});

handlebars.registerHelper('getSupportTypeDescription', function (supportType) {
  switch (supportType) {
    case 'type1':
      return 'Podparcie po bokach';
    case 'type2':
      return 'Podparcie po bokach + wspornik na środku';
    case 'type3':
      return 'Podparcie po bokach, układ przestawny';
    case 'type4':
      return 'Podparcie po bokach, układ przestawny + wspornik na środku';
    default:
      return supportType || 'Nie określono';
  }
});

async function sendEmail(emailOptions) {
  const emailStart = Date.now();
  console.log('📧 Email service starting...', {
    to: emailOptions.to,
    template: emailOptions.template,
    attachmentCount: emailOptions.attachments?.length || 0,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    memoryUsage: `${Math.round(
      process.memoryUsage().heapUsed / 1024 / 1024,
    )}MB`,
  });

  try {
    // Set up handlebars template engine
    const templateStart = Date.now();
    const templatePath = path.resolve('./templates/emails');
    const templateContent = fs.readFileSync(
      path.join(templatePath, emailOptions.template + '.hbs'),
      'utf8',
    );

    // Compile template with handlebars
    const template = handlebars.compile(templateContent);
    const htmlContent = template(emailOptions.context);
    console.log(`📧 Template compiled in ${Date.now() - templateStart}ms`);

    // Prepare attachments
    const attachmentStart = Date.now();
    const attachments = [];
    if (emailOptions.attachments && emailOptions.attachments.length > 0) {
      for (const attachment of emailOptions.attachments) {
        const fileSize = fs.statSync(attachment.path).size;
        console.log(
          `📧 Processing attachment: ${attachment.filename} (${Math.round(
            fileSize / 1024,
          )}KB)`,
        );

        // Read file as Buffer and convert to base64 for SendGrid
        const content = await fs.promises.readFile(attachment.path);
        attachments.push({
          filename: attachment.filename,
          content: content.toString('base64'),
          contentType: attachment.contentType,
          encoding: 'base64',
        });
      }
    }
    console.log(
      `📧 Attachments processed in ${Date.now() - attachmentStart}ms`,
    );

    /*
     *  ======================
     *  SendGrid API (All Environments)
     *  ======================
     */

    console.log('📧 Initializing SendGrid API...', {
      environment: process.env.NODE_ENV,
      hasApiKey: !!process.env.SENDGRID_API_KEY,
      timestamp: new Date().toISOString(),
    });

    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SENDGRID_API_KEY is not configured');
    }

    const initStart = Date.now();
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log(`📧 SendGrid API initialized in ${Date.now() - initStart}ms`);

    // Prepare SendGrid message
    const sendGridMsg = {
      to: emailOptions.to,
      from: emailOptions.from,
      subject: emailOptions.subject,
      html: htmlContent,
    };

    // Add attachments if present
    if (attachments.length > 0) {
      sendGridMsg.attachments = attachments.map((attachment) => ({
        content: attachment.content,
        filename: attachment.filename,
        type: attachment.contentType,
        disposition: 'attachment',
      }));
    }

    console.log('📧 Sending email via SendGrid API...', {
      to: emailOptions.to,
      from: emailOptions.from,
      subject: emailOptions.subject,
      attachmentCount: attachments.length,
      htmlLength: htmlContent.length,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      apiKeyPrefix: process.env.SENDGRID_API_KEY?.substring(0, 10) + '...',
    });

    // Log the exact message being sent for debugging
    console.log('📧 SendGrid message structure:', {
      to: sendGridMsg.to,
      from: sendGridMsg.from,
      subject: sendGridMsg.subject,
      hasHtml: !!sendGridMsg.html,
      attachmentCount: sendGridMsg.attachments?.length || 0,
    });

    const sendStart = Date.now();
    const response = await sgMail.send(sendGridMsg);
    console.log(`📧 Email sent in ${Date.now() - sendStart}ms`);
    console.log('📧 SendGrid response:', {
      statusCode: response[0].statusCode,
      messageId: response[0].headers['x-message-id'],
    });

    console.log(
      `📧 Total email process completed in ${Date.now() - emailStart}ms`,
    );
    return {
      message: `Email sent successfully via SendGrid API`,
      info: response[0],
    };
  } catch (error) {
    console.error('📧 Failed to send email:', error);
    console.error(
      '📧 Email process failed after',
      Date.now() - emailStart,
      'ms',
    );

    // Log SendGrid API specific errors
    if (error.response && error.response.body) {
      console.error('📧 SendGrid API error details:', {
        statusCode: error.code,
        body: error.response.body,
        errors: error.response.body.errors,
        headers: error.response.headers,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        memoryUsage: `${Math.round(
          process.memoryUsage().heapUsed / 1024 / 1024,
        )}MB`,
      });
      // Log detailed error messages
      if (
        error.response.body.errors &&
        Array.isArray(error.response.body.errors)
      ) {
        console.error('📧 SendGrid error messages:');
        error.response.body.errors.forEach((err, index) => {
          console.error(
            `  ${index + 1}. ${err.message || JSON.stringify(err)}`,
          );
          // Log field if present (often tells us which field has the issue)
          if (err.field) {
            console.error(`     Field: ${err.field}`);
          }
          // Log help link if present
          if (err.help) {
            console.error(`     Help: ${err.help}`);
          }
        });
      }
      // Log the from address that failed for debugging
      console.error('📧 Failed "from" address:', emailOptions.from);
      console.error(
        '📧 Used API key prefix:',
        process.env.SENDGRID_API_KEY?.substring(0, 10) + '...',
      );
    } else {
      // Log other errors
      console.error('📧 Email service error:', {
        code: error.code,
        message: error.message,
        stack: error.stack?.split('\n')[0],
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
      });
    }
    throw error;
  }
}

module.exports = sendEmail;
