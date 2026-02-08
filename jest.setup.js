// Testy mogą łączyć się z bazą deweloperską (MONGODB_URI z .env).
// Aby wymusić brak połączenia (np. w CI bez bazy), ustaw: TEST_MOCK_DB=1
if (process.env.NODE_ENV !== 'test') process.env.NODE_ENV = 'test';

if (process.env.TEST_MOCK_DB === '1') {
  const mongoose = require('mongoose');
  mongoose.connect = jest.fn().mockResolvedValue(undefined);
}
