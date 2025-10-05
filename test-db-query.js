const mongoose = require('mongoose');
require('dotenv').config();

const Products = require('./models/Products');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB\n');

    // Test 1: Query with string ID
    console.log('Test 1: Query with string ID "110.042011"');
    const result1 = await Products.find({ id: "110.042011" });
    console.log('Result count:', result1.length);
    if (result1.length > 0) {
      console.log('Found:', result1[0].id, typeof result1[0].id);
    }
    console.log('');

    // Test 2: Query with numeric ID
    console.log('Test 2: Query with numeric ID 110.042011');
    const result2 = await Products.find({ id: 110.042011 });
    console.log('Result count:', result2.length);
    if (result2.length > 0) {
      console.log('Found:', result2[0].id, typeof result2[0].id);
      console.log('Has name:', !!result2[0].name);
      console.log('Has price:', !!result2[0].price);
      console.log('Name PL:', result2[0].name?.pl?.substring(0, 50));
    }
    console.log('');

    // Test 3: Query with $in and mixed types
    console.log('Test 3: Query with $in ["110.042011"]');
    const result3 = await Products.find({ id: { $in: ["110.042011"] } });
    console.log('Result count:', result3.length);
    console.log('');

    // Test 4: Query with $in and converted to number
    console.log('Test 4: Query with $in [Number("110.042011")]');
    const result4 = await Products.find({ id: { $in: [Number("110.042011")] } });
    console.log('Result count:', result4.length);
    if (result4.length > 0) {
      console.log('Found:', result4[0].id);
    }

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
