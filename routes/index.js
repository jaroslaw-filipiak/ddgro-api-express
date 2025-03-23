var express = require('express');
const { version } = require('pdfkit');
var router = express.Router();

/* GET home page. */
router.get('/', function (req, res, next) {
  res.status(200).json({
    message: 'DDGRO API Works!',
    node_env: process.env.NODE_ENV,
    version: process.env.VER,
    contact: {
      email: 'info@j-filipiak.pl',
    },
  });
});

module.exports = router;
