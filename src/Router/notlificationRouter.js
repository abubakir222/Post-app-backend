const express = require('express');
const router = express.Router();
const notificationCtrl = require('../Controller/notlificationCtrl');
const auth = require('../middleware/authMiddleware');

router.get('/', auth, notificationCtrl.getNotifications);

router.post('/', auth, notificationCtrl.createNotification);
router.patch('/:id/read', auth, notificationCtrl.readNotification);
router.delete('/:id', auth, notificationCtrl.deleteNotification);
router.delete('/all', auth, notificationCtrl.deleteAllNotifications);

module.exports = router;