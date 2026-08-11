const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let user = await User.findOne({ email: 'default@watertank.com' });
    if (!user) {
      user = await User.create({
        email: 'default@watertank.com',
        passwordHash: 'dummy_hash_not_used',
        name: 'Default User'
      });
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { protect };
