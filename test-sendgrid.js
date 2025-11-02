require('dotenv').config();
const sendEmail = require('./services/sendEmail');

async function testSendGrid() {
  console.log('🧪 Testing SendGrid integration...\n');

  console.log('Environment:', process.env.NODE_ENV);
  console.log('SendGrid API Key configured:', !!process.env.SENDGRID_API_KEY);
  console.log('SendGrid API Key prefix:', process.env.SENDGRID_API_KEY?.substring(0, 10) + '...\n');

  const emailOptions = {
    to: 'info@j-filipiak.pl', // Real test email
    from: 'DDGRO.EU <noreply@ddpedestals.eu>',
    subject: '[TEST] SendGrid Integration Test - DDGRO',
    template: 'order_pl', // Using Polish template for test
    context: {
      items: [
        {
          name: { pl: 'Test Product' },
          height_mm: '50-70',
          count: 5,
          total_price: '53.50',
        },
      ],
      total: '53.50',
    },
  };

  try {
    console.log('📧 Attempting to send test email...');
    const result = await sendEmail(emailOptions);

    console.log('\n✅ SUCCESS!');
    console.log('Message:', result.message);
    console.log('Status Code:', result.info?.statusCode);
    console.log('\n✨ SendGrid is working correctly!');
    console.log('\n📌 Next steps:');
    console.log('1. Check SendGrid Dashboard → Activity Feed');
    console.log('2. Look for email to:', emailOptions.to);
    console.log('3. If it\'s a test email, it might not be delivered');
    console.log('4. For real test, change "to" address to your email');

  } catch (error) {
    console.error('\n❌ FAILED!');
    console.error('Error:', error.message);

    if (error.response?.body) {
      console.error('\nSendGrid Error Details:');
      console.error(JSON.stringify(error.response.body, null, 2));
    }

    console.error('\n🔧 Troubleshooting:');
    console.error('1. Check if SENDGRID_API_KEY is correct');
    console.error('2. Verify API key has "Mail Send" permission');
    console.error('3. Check if sender email is verified in SendGrid');
    console.error('4. Review SendGrid Dashboard for more details');
  }
}

testSendGrid();
