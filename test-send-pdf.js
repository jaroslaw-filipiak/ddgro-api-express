const http = require('http');

const appId = '68e285008c40ff76f2ba636a';
const email = 'test@example.com';

console.log(`Testing PDF generation for ${appId}...\n`);

const postData = JSON.stringify({ to: email });

const options = {
  hostname: 'localhost',
  port: 3001,
  path: `/api/application/send-order-summary/${appId}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  },
};

const req = http.request(options, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));

  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('\nResponse Body:');
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.write(postData);
req.end();

console.log('Sending POST request to generate PDF...');
console.log('This may take a few seconds...\n');
