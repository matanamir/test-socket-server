var test = require('tap').test,
    TestSocketServer = require('../index.js'),
    FramingSocket = require('framing-socket'),
    util = require('util'),
    host = 'localhost',
    port = 8111;

// -----------------------------------------------------
// Test Socket Server Functional Tests
// -----------------------------------------------------

test('Start and stop the server', function (t) {
    var server = new TestSocketServer();

    server.listen(port).then(function() {
        t.ok(server.listening, 'Server started successfully');
        return server.close();
    }).then(function() {
        t.ok(!server.listening, 'Server stopped successfully');
        t.end();
    }).otherwise(function(err) {
        t.ok(false, 'Error when trying to start/stop the server: ' + util.inspect(err));
        t.end();
    });
});


test('Test client connect -> client write full frame -> server response full frame -> client close', function (t) {
    var server = new TestSocketServer({
            timeout_ms: 30000
        }),
        client = create_client(),
        rpc_id = 1;

    server.listen(port).then(function() {
        return client.connect(host, port);
    }).then(function() {
        return client.write(rpc_id, new Buffer([0x01, 0x02, 0x03]));
    }).then(function(frame) {
        t.ok((frame.buf.length >= 100) && (frame.buf.length <= 2048), 'Test Socket server returns between 100 and 2048 bytes');
        return client.close();
    }).then(function() {
        return server.close();
    }).then(function() {
        t.end();
    }).otherwise(function(err) {
        t.ok(false, 'Error caught: ' + util.inspect(err));
        t.end();
        return server.close();
    });
});

test('Test client connect -> client write full frame -> server response full frame -> server force close', function (t) {
    var server = new TestSocketServer({
            timeout_ms: 30000
        }),
        client = create_client(),
        rpc_id = 1;

    server.listen(port).then(function() {
        return client.connect(host, port);
    }).then(function() {
            return client.write(rpc_id, new Buffer([0x01, 0x02, 0x03]));
        }).then(function(frame) {
            t.ok((frame.buf.length >= 100) && (frame.buf.length <= 2048), 'Test Socket server returns between 100 and 2048 bytes');
            return server.close();
        }).then(function() {
            t.end();
        }).otherwise(function(err) {
            t.ok(false, 'Error caught: ' + util.inspect(err));
            t.end();
            return server.close();
        });
});

function create_client() {
    return new FramingSocket();
}






