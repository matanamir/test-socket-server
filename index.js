var net = require('net'),
    util = require('util'),
    when = require('when'),
    FramingBuffer = require('framing-buffer'),
    OffsetBuffer = require('offset-buffer'),
    debug = false;

module.exports = require('./test-socket-server.js')(
    FramingBuffer,
    OffsetBuffer,
    debug,
    when,
    net,
    util,
    console
);


