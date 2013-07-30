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

    function on_server_close() {
        t.ok(!server.listening, 'Server stopped successfully');
        t.end();
    }

    function on_server_listen() {
        t.ok(server.listening, 'Server started successfully');
        server.close(on_server_close);
    }

    server.listen(port, on_server_listen);
});

test('Test client connect -> client write full frame -> server response full frame -> client close', function (t) {
    var server = create_server(),
        client = create_client(),
        rpc_id = 1;

    function on_close() {
        t.end();
    }

    function on_frame(err, frame) {
        if (err) {
            errback(t, err, server);
            return;
        }
        t.ok((frame.buf.length >= server.response_min_payload) && (frame.buf.length <= server.response_max_payload),
            'Test Socket server returns between ' + server.response_min_payload +
                ' and ' + server.response_max_payload + ' bytes');
        client.close();
        server.close(on_close);
    }

    function on_connect(err) {
        if (err) {
            errback(t, err, server);
            return;
        }
        client.write(rpc_id, new Buffer([0x01, 0x02, 0x03]), on_frame);
    }

    function on_listen() {
        client.connect(host, port, on_connect);
    }

    server.listen(port, on_listen);
});

test('Test client connect -> client write full frame -> server response full frame -> server force close', function (t) {
    var server = create_server(),
        client = create_client(),
        rpc_id = 1;

    function on_close() {
        t.end();
    }

    function on_frame(err, frame) {
        if (err) {
            errback(t, err, server);
            return;
        }
        t.ok((frame.buf.length >= server.response_min_payload) && (frame.buf.length <= server.response_max_payload),
            'Test Socket server returns between ' + server.response_min_payload +
                ' and ' + server.response_max_payload + ' bytes');
        server.close(on_close);
    }

    function on_connect(err) {
        if (err) {
            errback(t, err, server);
            return;
        }
        client.write(rpc_id, new Buffer([0x01, 0x02, 0x03]), on_frame);
    }

    function on_listen() {
        client.connect(host, port, on_connect);
    }

    server.listen(port, on_listen);
});

test('Test client connect -> client write full frame -> server stuck before response -> client timeout close', function (t) {
    var server = create_server({
            find_free_port: true,
            stuck_before_response: true
        }),
        client = create_client({
            timeout_ms: 1000
        }),
        rpc_id = 1;

    function on_server_close() {
        t.end();
    }

    // on the client timeout, close up the connection
    client.on('timeout', function() {
        client.close();
        t.ok(true, 'Client timed out waiting for response');
        server.close(on_server_close);
    });

    function on_frame(err, frame) {
        if (err) {
            errback(t, err, server);
            return;
        }
        t.ok(false, 'Client should not have received response from the server');
        server.close(on_server_close);
    }

    function on_connect(err) {
        if (err) {
            errback(t, err, server);
            return;
        }
        client.write(rpc_id, new Buffer([0x01, 0x02, 0x03]), on_frame);
    }

    function on_listen() {
        client.connect(host, port, on_connect);
    }

    server.listen(port, on_listen);
});

test('Test client connect -> client write full frame -> server stuck partial response -> client timeout close', function (t) {
    var server = create_server({
            find_free_port: true,
            stuck_partial_response: true
        }),
        client = create_client({
            timeout_ms: 1000
        }),
        rpc_id = 1;

    function on_server_close() {
        t.end();
    }

    // on the client timeout, close up the connection
    client.on('timeout', function() {
        client.close();
        t.ok(true, 'Client timed out waiting for frame');
        server.close(on_server_close);
    });

    function on_frame(err, frame) {
        if (err) {
            errback(t, err, server);
            return;
        }
        t.ok(false, 'Client should not have received response from the server');
        server.close(on_server_close);
    }

    function on_connect(err) {
        if (err) {
            errback(t, err, server);
            return;
        }
        client.write(rpc_id, new Buffer([0x01, 0x02, 0x03]), on_frame);
    }

    function on_listen() {
        client.connect(host, port, on_connect);
    }

    server.listen(port, on_listen);
});

function errback(t, err, server) {
    t.ok(false, 'Error caught: ' + util.inspect(err));
    t.end();
    return server.close();
}

function create_server(options) {
    return new TestSocketServer(options || {
        find_free_port: true
    });
}

function create_client(options) {
    return new FramingSocket(options);
}






