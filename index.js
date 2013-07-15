var net = require('net'),
    util = require('util'),
    when = require('when'),
    FramingBuffer = require('framing-buffer'),
    OffsetBuffer = require('offset-buffer');

module.exports = require('./test-socket-server.js')(FramingBuffer, OffsetBuffer, when, net, util, console);


