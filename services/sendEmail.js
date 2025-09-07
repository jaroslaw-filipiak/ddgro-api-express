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

/*
* Tutaj narazie bez tłumaczenia ponieważ to info idzie do maila technicznego na chwilę obecną tylko 
do joozef.baar@ddgro.eu także to info wysyłam po Polsku
*/
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
  try {
    // Set up handlebars template engine
    const templatePath = path.resolve('./templates/emails');
    const templateContent = fs.readFileSync(
      path.join(templatePath, emailOptions.template + '.hbs'),
      'utf8',
    );

    // Compile template with handlebars
    const template = handlebars.compile(templateContent);
    const htmlContent = template(emailOptions.context);

    // Prepare attachments
    const attachments = [];
    if (emailOptions.attachments && emailOptions.attachments.length > 0) {
      for (const attachment of emailOptions.attachments) {
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
      });

      const info = await transporter.sendMail({
        to: emailOptions.to,
        from: emailOptions.from,
        subject: emailOptions.subject,
        html: htmlContent,
        attachments: attachments,
      });

      return { message: `Email sent successfully via Mailtrap`, info };
    }

    /*
     *  ======================
     *  PRODUCTION
     *  ======================
     */

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
    });

    const info = await transporter.sendMail({
      to: emailOptions.to,
      from: emailOptions.from,
      subject: emailOptions.subject,
      html: htmlContent,
      attachments: attachments,
    });

    return { message: `Email sent successfully via SMTP`, info };
  } catch (error) {
    console.error('Failed to send email:', error);
    if (error.response) {
      console.error('Email error details:', error.response.body);
    }
    throw error;
  }
}

module.exports = sendEmail;
