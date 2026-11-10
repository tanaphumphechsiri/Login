const express = require('express');
const createAuthController = require('../controllers/authController');

module.exports = function createAuthRoutes(dependencies) {
  const router = express.Router();
  const controller = createAuthController(dependencies);

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.get('/me', controller.me);
  router.post('/logout', controller.logout);

  return router;
};
