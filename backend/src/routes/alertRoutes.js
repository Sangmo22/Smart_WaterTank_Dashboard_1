const express = require('express');
const router = express.Router();
const { sendLowSourceAlert } = require('../controllers/alertController');

router.post('/send-low-source-alert', sendLowSourceAlert);

module.exports = router;
