const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../../models/User');

// Middleware do sprawdzania ról
const checkRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Brak dostępu' });
  }
  next();
};

// Rejestracja
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Sprawdź czy użytkownik już istnieje
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: 'Użytkownik z tym emailem już istnieje' });
    }

    // Hashowanie hasła
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Tworzenie nowego użytkownika
    const newUser = new User({
      email,
      password: hashedPassword,
      name,
    });

    await newUser.save();

    res.status(201).json({ message: 'Użytkownik zarejestrowany pomyślnie' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Logowanie
router.post('/login', (req, res, next) => {
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      return res.status(400).json({ message: info.message });
    }

    // Generowanie tokenu JWT
    const payload = {
      id: user._id,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET ||
        '28f8541c88abf008761e304e7e3bde6a71c6f5b0ca048c84e314f0010907de5bca8553e676bc49b061252d6e4135f9b83bddea48b1246b407e33facc0b4c1c4f526d0427a9e55b357d74ebecaf92b9367521b67e2b85702849683fdbe9f00b9737e0a62afe9a68368ec36846882d6b6b173943b5fcc9ef60041f8b3515d56ee45051f3daa70174068d721af093293442275bf57d6b929b386d2f52baf1ae3e11748cae8dc0d3fb9d3e1d69c373c656a680c78162c3a6f86e9279eaa6c956ab2f470c1aec0ffe1d3ede1889cf7a2d984236017991e03a13ba3218eb7f885ae5ecb2bab9fccced2f3a94203f32cfc21a80ec0e1d68e81807e32c7c1b975e6ea48a8b86ea0e5a8cf49e7f13ef6463beb0b29a7c1a32bfcb50d0ceb581cf3675378ef15872f7dd5808a2c5507abe3340991d4a3f18e0194cf30d9b6abe048e76b392',
      {
        expiresIn: '1d',
      },
    );

    return res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  })(req, res, next);
});

// Chroniony endpoint - tylko dla zalogowanych
router.get(
  '/profile',
  passport.authenticate('jwt', { session: false }),
  (req, res) => {
    res.json({ user: req.user });
  },
);

// Chroniony endpoint - tylko dla adminów
router.get(
  '/admin',
  passport.authenticate('jwt', { session: false }),
  checkRole(['admin']),
  (req, res) => {
    res.json({ message: 'Dostęp tylko dla admina', user: req.user });
  },
);

module.exports = router;
