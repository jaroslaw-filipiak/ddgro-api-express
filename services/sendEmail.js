const nodemailer = require('nodemailer');
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
    memoryUsage: `${Math.round(process.memoryUsage().heapUsed/1024/1024)}MB`
  });

  try {
    // Set up handlebars template engine
    const templateStart = Date.now();
    const templatePath = path.resolve('./views/emails');
    const templateContent = fs.readFileSync(
      path.join(templatePath, emailOptions.template + '.handlebars'),
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
        console.log(`📧 Processing attachment: ${attachment.filename} (${Math.round(fileSize / 1024)}KB)`);

        // Read file as Buffer and convert to base64 for Nodemailer
        const content = await fs.promises.readFile(attachment.path);
        attachments.push({
          filename: attachment.filename,
          content: content.toString('base64'),
          contentType: attachment.contentType,
          encoding: 'base64',
        });
      }
    }
    console.log(`📧 Attachments processed in ${Date.now() - attachmentStart}ms`);

    const msg = {
      to: emailOptions.to,
      from: emailOptions.from,
      subject: emailOptions.subject,
      html: htmlContent,
      attachments: attachments,
    };

    /*
     *  ======================
     *  DEVELOPMENT
     *  ======================
     */

    if (process.env.NODE_ENV === 'development') {
      console.log('📧 Creating development transporter (Mailtrap)...', {
        host: process.env.MAILTRAP_HOST,
        port: process.env.MAILTRAP_PORT,
        hasAuth: !!(process.env.MAILTRAP_USERNAME && process.env.MAILTRAP_PASSWORD),
        timestamp: new Date().toISOString()
      });

      const transporterStart = Date.now();
      const transporter = nodemailer.createTransport({
        host: process.env.MAILTRAP_HOST,
        port: process.env.MAILTRAP_PORT,
        auth: {
          user: process.env.MAILTRAP_USERNAME,
          pass: process.env.MAILTRAP_PASSWORD,
        },
        pool: true,
        maxConnections: 1,
        rateDelta: 1000,
        rateLimit: 5,
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
      });
      console.log(`📧 Mailtrap transporter created in ${Date.now() - transporterStart}ms`);

      console.log('📧 Sending development email...', {
        to: emailOptions.to,
        from: emailOptions.from,
        subject: emailOptions.subject,
        attachmentCount: attachments.length,
        htmlLength: htmlContent.length,
        timestamp: new Date().toISOString()
      });
      const sendStart = Date.now();
      const info = await transporter.sendMail({
        to: emailOptions.to,
        from: emailOptions.from,
        subject: emailOptions.subject,
        html: htmlContent,
        attachments: attachments,
      });
      console.log(`📧 Development email sent in ${Date.now() - sendStart}ms`);

      return { message: `Email sent successfully via Mailtrap`, info };
    }

    /*
     *  ======================
     *  PRODUCTION
     *  ======================
     */

    console.log('📧 Creating production transporter (Postmark)...', {
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      hasAuth: !!(process.env.MAIL_USERNAME && process.env.MAIL_PASSWORD),
      timestamp: new Date().toISOString()
    });

    const transporterStart = Date.now();
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
      },
      pool: true,
      maxConnections: 1,
      rateDelta: 1000,
      rateLimit: 5,
      connectionTimeout: 120000, // 2 minutes for Postmark
      greetingTimeout: 60000,   // 1 minute for Postmark
      socketTimeout: 120000,    // 2 minutes for Postmark
    });
    console.log(`📧 Production transporter created in ${Date.now() - transporterStart}ms`);

    console.log('📧 Sending production email...', {
      to: emailOptions.to,
      from: emailOptions.from,
      subject: emailOptions.subject,
      attachmentCount: attachments.length,
      htmlLength: htmlContent.length,
      timestamp: new Date().toISOString()
    });
    const sendStart = Date.now();
    const info = await transporter.sendMail({
      to: emailOptions.to,
      from: emailOptions.from,
      subject: emailOptions.subject,
      html: htmlContent,
      attachments: attachments,
    });
    console.log(`📧 Production email sent in ${Date.now() - sendStart}ms`);

    console.log(`📧 Total email process completed in ${Date.now() - emailStart}ms`);
    return { message: `Email sent successfully via SMTP`, info };
  } catch (error) {
    console.error('📧 Failed to send email:', error);
    console.error('📧 Email process failed after', Date.now() - emailStart, 'ms');
    if (error.response) {
      console.error('📧 Email error details:', error.response.body);
    }

    // Log connection-specific errors with comprehensive details
    if (error.code === 'ETIMEDOUT') {
      console.error('📧 Connection timeout details:', {
        host: process.env.MAIL_HOST,
        port: process.env.MAIL_PORT,
        code: error.code,
        command: error.command,
        timeout: error.timeout,
        timestamp: new Date().toISOString(),
        memoryUsage: `${Math.round(process.memoryUsage().heapUsed/1024/1024)}MB`,
        uptime: `${Math.round(process.uptime())}s`,
        environment: process.env.NODE_ENV
      });
    }

    // Log other email-specific errors
    if (error.code) {
      console.error('📧 SMTP Error details:', {
        code: error.code,
        response: error.response,
        responseCode: error.responseCode,
        command: error.command,
        host: process.env.MAIL_HOST,
        port: process.env.MAIL_PORT,
        timestamp: new Date().toISOString()
      });
    }
    throw error;
  }
}

module.exports = sendEmail;
