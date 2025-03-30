const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const User = require('../models/User');

// Strategia lokalna (username/password)
passport.use(
  new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email });

        if (!user) {
          return done(null, false, {
            message: 'Nieprawidłowy email lub hasło',
          });
        }

        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
          return done(null, false, {
            message: 'Nieprawidłowy email lub hasło',
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    },
  ),
);

// Strategia JWT
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey:
    process.env.JWT_SECRET ||
    '28f8541c88abf008761e304e7e3bde6a71c6f5b0ca048c84e314f0010907de5bca8553e676bc49b061252d6e4135f9b83bddea48b1246b407e33facc0b4c1c4f526d0427a9e55b357d74ebecaf92b9367521b67e2b85702849683fdbe9f00b9737e0a62afe9a68368ec36846882d6b6b173943b5fcc9ef60041f8b3515d56ee45051f3daa70174068d721af093293442275bf57d6b929b386d2f52baf1ae3e11748cae8dc0d3fb9d3e1d69c373c656a680c78162c3a6f86e9279eaa6c956ab2f470c1aec0ffe1d3ede1889cf7a2d984236017991e03a13ba3218eb7f885ae5ecb2bab9fccced2f3a94203f32cfc21a80ec0e1d68e81807e32c7c1b975e6ea48a8b86ea0e5a8cf49e7f13ef6463beb0b29a7c1a32bfcb50d0ceb581cf3675378ef15872f7dd5808a2c5507abe3340991d4a3f18e0194cf30d9b6abe048e76b392',
};

passport.use(
  new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
      const user = await User.findById(payload.id);

      if (user) {
        return done(null, user);
      }

      return done(null, false);
    } catch (err) {
      return done(err, false);
    }
  }),
);

module.exports = passport;
