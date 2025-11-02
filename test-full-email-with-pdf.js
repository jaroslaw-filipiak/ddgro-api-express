require('dotenv').config();
const mongoose = require('mongoose');
const Application = require('./models/Application');

async function createTestApplicationAndSendEmail() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Tworzenie testowej aplikacji
    console.log('📝 Creating test application...');
    const testApplication = new Application({
      type: 'slab',
      total_area: 50,
      count: 1,
      gap_between_slabs: 3, // Test z 3mm - powinien wybrać K3/D3
      lowest: 50,
      highest: 150,
      terrace_thickness: 20,
      slab_width: 600,
      slab_height: 600,
      slab_thickness: 20,
      support_type: 'type2',
      main_system: 'standard',
      name_surname: 'Jan Kowalski (TEST)',
      email: 'info@j-filipiak.pl',
      phone: '+48 123 456 789',
      proffesion: 'Architekt',
      lang: 'pl',
      slabs_count: 139,
      supports_count: 80,
      products: [],
      accessories: [],
      additional_accessories: [],
    });

    await testApplication.save();
    console.log('✅ Test application created!');
    console.log('   ID:', testApplication._id);
    console.log('   Email:', testApplication.email);
    console.log('   Gap:', testApplication.gap_between_slabs + 'mm');
    console.log('   Type:', testApplication.type);
    console.log('   Support Type:', testApplication.support_type);
    console.log('   Main System:', testApplication.main_system);
    console.log('');

    // Wysłanie emaila przez API
    console.log('📧 Sending email with PDF through API...');

    const http = require('http');
    const postData = JSON.stringify({ to: 'info@j-filipiak.pl' });

    const options = {
      hostname: 'localhost',
      port: 3001,
      path: `/api/application/send-order-summary/${testApplication._id}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          console.log('✅ API Response Status:', res.statusCode);
          try {
            const response = JSON.parse(data);
            console.log('✅ Response:', JSON.stringify(response, null, 2));
            console.log('\n🎉 SUCCESS! Email with PDF sent!');
            console.log('\n📬 Check your inbox at: info@j-filipiak.pl');
            console.log('📎 The email should contain:');
            console.log('   - Table with products (K3/D3 variants for 3mm gap)');
            console.log('   - PDF attachment with full offer');
            console.log('   - Polish language');
            console.log('\n📊 You can also check SendGrid Dashboard:');
            console.log('   https://app.sendgrid.com/email_activity');
            console.log('\n🧹 Test application ID:', testApplication._id);
            console.log('   (You can delete it later if needed)');

            mongoose.disconnect();
            resolve();
          } catch (e) {
            console.error('❌ Failed to parse response:', data);
            mongoose.disconnect();
            reject(e);
          }
        });
      });

      req.on('error', (error) => {
        console.error('❌ Request failed:', error.message);
        mongoose.disconnect();
        reject(error);
      });

      req.write(postData);
      req.end();
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Czekaj na sprawdzenie czy serwer działa
console.log('🧪 Testing Full Email Flow with PDF\n');
console.log('⚙️  Prerequisites:');
console.log('   - Server must be running on localhost:3001');
console.log('   - MongoDB must be accessible');
console.log('   - SendGrid API key must be configured\n');

setTimeout(() => {
  createTestApplicationAndSendEmail();
}, 1000);
