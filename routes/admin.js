const express = require('express');
const createAdminController = require('../controllers/adminController');
const createRequireAdmin = require('../middleware/requireAdmin');

module.exports = function createAdminRoutes(dependencies) {
  const router = express.Router();
  const controller = createAdminController(dependencies);
  const requireAdmin = createRequireAdmin(dependencies);

  router.use(requireAdmin);
  router.get('/users', controller.listUsers);
  router.get('/deleted-users', controller.listDeletedUsers);
  router.patch('/deleted-users/:id/restore', controller.restoreUser);
  router.patch('/users/:id/role', controller.setUserRole);
  router.patch('/users/:id', controller.updateUser);
  router.delete('/users/:id', controller.deleteUser);

  return router;
};
