/**
 * A socket server convenient for testing.
 *
 * It expects the data to be sent in the following format:
 *
 * |frame_size|rpc id|   data    |
 * |:--------:|:----:|:---------:|
 * |    32    |  32  | *ignored* |
 *
 *
 * And returns random data between 100 and 2048 bytes in the following format:
 *
 * |frame_size|rpc id|random data|
 * |:--------:|:----:|:---------:|
 * |    32    |  32  | 100-2048  |
 *
 * Data is sent in Big-endian.
 *
 */
module.exports = function(FramingBuffer, OffsetBuffer, when, net, util, logger) {

    /**
     * Minimum size of random response payload (inclusive)
     */
    var RESPONSE_PAYLOAD_MIN = 100;

    /**
     * Maximum size of random response payload (exclusive)
     */
    var RESPONSE_PAYLOAD_MAX = 2048;

    process.on('uncaughtException', function(err) {
        logger.log('Uncaught exception: ' + err);
        process.exit(-1);
    });

    /**
     * You can provide options to override the defaults: {
     *      timeout_ms: 60000,
     *      stuck_ms: 30000,
     *      stuck_before_response: false,
     *      stuck_partial_response: false
     * }
     *
     * timeout_ms: Main socket timeout.  If no activity occurs on a socket for this time, it will
     *      close the connection.
     *
     * stuck_ms: Amount of time to stay "stuck" if one of the stuck situations is enabled
     *
     * stuck_before_response: Server will stop sending data (stuck) after receiving a request
     *      and before a response is sent for stuck_ms.  This does not drop the connection until the
     *      timeout_ms passes or the client ends the connection.
     *
     * stuck_partial_response: Server will stop sending data (stuck) after receiving a request
     *      and after part of the response is sent for stuck_ms.  This does not drop the connection
     *      until the timeout_ms passes or the client ends the connection.
     *
     */
    function TestSocketServer(options) {
        var self = this;

        options = options || {};

        /**
         * Server side socket timeout (connection will be ended after this amount of inactivity).
         */
        this.timeout_ms = options.timeout_ms || 60000;

        /**
         * Amount of time to stay "stuck" if one of the other stuck if stuckness is enabled
         */
        this.stuck_ms = options.stuck_ms || 30000;

        /**
         * Server will stop sending data (stuck) after receiving a request
         * and before a response is sent.  This does not drop the connection until the timeout_ms
         * passes or the client ends the connection.
         */
        this.stuck_before_response = options.stuck_before_response || false;

        /**
         * Server will stop sending data (stuck) after receiving a request
         * and after part of the response is sent.  This does not drop the connection until the
         * timeout_ms passes or the client ends the connection.
         */
        this.stuck_partial_response = options.stuck_partial_response || false;

        /**
         * Keeps track of the current buffering state per connection
         */
        this.connection_state = {};

        /**
         * Start up the TCP server save the server instance
         */
        this.server = net.createServer(function on_connection_start(connection) {
            self.on_connection_start(connection);
        });

        /**
         * Flag to keep track of our listening status
         */
        this.listening = false;
    }

    /**
     * Used to bind a socket listener to the provided port.  Calls
     * the callback provided when the server binds successfully.
     */
    TestSocketServer.prototype.listen = function(port) {
        var self = this,
            deferred = when.defer();

        this.server.listen(port, function on_listen() {
            self.on_listen(port);
            deferred.resolve();
        });

        return deferred.promise;
    };

    /**
     * Closes the test socket server
     */
    TestSocketServer.prototype.close = function() {
        var self = this,
            deferred = when.defer();

        if (this.listening) {
            // go through and end all the open sockets
            Object.keys(this.connection_state).forEach(function(connection_id) {
                var state = self.connection_state[connection_id];
                state.connection.end();
            });
            this.server.close(function() {
                self.on_close();
                deferred.resolve();
            });
        } else {
            deferred.resolve();
        }

        return deferred.promise;
    };

    /**
     * Called when the listen binding succeeds
     */
    TestSocketServer.prototype.on_listen = function(port) {
        this.listening = true;
        logger.log('TestSocketServer.on_listen: Server bound to port: ' + port);
    };

    /**
     * Called when the connection is closed
     */
    TestSocketServer.prototype.on_close = function() {
        this.listening = false;
        logger.log('Server closed successfully. Not listening anymore :```(');
    };

    /**
     * Called on every successful new connection to the server
     */
    TestSocketServer.prototype.on_connection_start = function(connection) {
        var self = this,
            framing_buffer;

        // Use the client ip and port as a unique identifier for the connection
        // and store it as part of the connection object (piggyback!)
        connection.id = get_remote_addr(connection);
        // initialize the FrameBuffer for the current connection
        framing_buffer = this.save_connection_state(connection);
        logger.log('TestSocketServer.on_connection_start: Connection started: ' + connection.id);
        connection.setNoDelay(true);
        connection.setTimeout(this.timeout_ms, function on_timeout() {
            self.on_connection_timeout(connection);
        });
        // give the FrameBuffer access to the incoming socket data
        connection.on('data', function on_connection_data(data) {
            framing_buffer.push(data);
        });
        // listen to the FrameBuffer's "frame" event when a full frame is ready
        framing_buffer.on('frame', function on_frame(frame) {
            self.on_frame(connection, frame);
        });
        connection.on('error', function on_connection_error(err) {
            self.on_connection_error(connection, err);
        });
        connection.on('end', function on_connection_end() {
            self.on_connection_end(connection);
        });
    };

    /**
     * When the FramingBuffer notifies us a new frame, we go ahead and generate
     * a response with the same RPC_ID and a random number of bytes as payload
     */
    TestSocketServer.prototype.on_frame = function(connection, frame) {
        var self = this,
            rpc_id;

        try {
            rpc_id = frame.readInt32BE();
            logger.log('TestSocketServer.on_frame: Received incoming frame with rpc_id: ' + rpc_id + ' and data: 0x'
                + frame.toString('hex'));
            if (this.stuck_before_response) {
                this.connection_state[connection.id].timer_stuck_before = setTimeout(function stuck_response() {
                    self.send_response(connection, rpc_id);
                }, this.stuck_ms);
            } else {
                this.send_response(connection, rpc_id);
            }
        } catch (err) {
            throw new Error('Error parsing input data: ' + util.inspect(err));
        }
    };

    /**
     * Send down the response to an incoming request using the same RPC_ID and a random
     * payload
     */
    TestSocketServer.prototype.send_response = function(connection, rpc_id) {
        var random_data = new Buffer(get_random_number(RESPONSE_PAYLOAD_MIN, RESPONSE_PAYLOAD_MAX)),
            response = new OffsetBuffer(random_data.length + 4 + 4), // include frame_length and rpc_id fields
            random_point,
            part1,
            part2;

        response.writeInt32BE(random_data.length + 4);
        response.writeInt32BE(rpc_id);
        response.copyFrom(random_data);

        if (this.stuck_partial_response) {
            random_point = get_random_number(1, response.buf.length);
            part1 = response.buf.slice(0, random_point);
            part2 = response.buf.slice(random_point);
            if (connection != null) {
                logger.log('TestSocketServer.send_response: Sending response to rpc_id: ' + rpc_id + ' with partial bytes ' + part1.length + ' bytes out of ' + random_data.length);
                connection.write(part1);
                this.connection_state[connection.id].timer_stuck_partial = setTimeout(function stuck_partial() {
                    logger.log('TestSocketServer.send_response: Sending response to rpc_id: ' + rpc_id + ' with rest of bytes ' + part2.length + ' bytes out of ' + random_data.length);
                    connection.write(part2);
                }, this.stuck_ms);
            }
        } else {
            if (connection != null) {
                logger.log('TestSocketServer.send_response: Sending response to rpc_id: ' + rpc_id + ' with ' + random_data.length + ' bytes');
                connection.write(response.buf);
            }
        }
    };

    TestSocketServer.prototype.get_open_connections = function() {
        return Object.keys(this.connection_state);
    };

    TestSocketServer.prototype.close_connection = function(connection_id) {
        var conn = this.connection_state[connection_id].connection;
        if (conn) {
            conn.end();
            logger.log('TestSocketServer.close_connection: Ended connection: ' + connection_id);
        }
    };

    /**
     * Deal with a socket idle timing out.  In this case, we close the connection down.
     */
    TestSocketServer.prototype.on_connection_timeout = function(connection) {
        logger.log('TestSocketServer.on_connection_timeout: Connection timed out (' + this.timeout_ms + 'ms): ' + connection.id);
        this.close_connection(connection);
    };

    /**
     * Cleanup when a connection is closed (planned and unplanned)
     */
    TestSocketServer.prototype.on_connection_end = function(connection) {
        var state = this.connection_state[connection.id],
            frame_buffer = state.frame_buffer,
            frame_length = frame_buffer.current_frame_length,
            current_length = frame_buffer.current_frame_buffer.length;

        logger.log('TestSocketServer.on_connection_end: Connection ended: ' + connection.id);
        // remove the relevant listeners and clear this state from our map
        connection.removeAllListeners('data');
        connection.removeAllListeners('end');
        connection.removeAllListeners('error');
        frame_buffer.removeAllListeners('frame');
        if (state.timer_stuck_before) {
            clearTimeout(state.timer_stuck_before);
        }
        if (state.timer_stuck_partial) {
            clearTimeout(state.timer_stuck_partial);
        }
        // let the user know that some data will be lost if a full frame wasn't completed
        if (frame_buffer.current_frame_buffer.length > 0) {
            logger.warn('TestSocketServer.on_connection_end: Input buffer not empty.  Expected frame size: ' +
                ((frame_length === 0) ? 'unknown' : frame_length) +
                ', currently buffered: ' + current_length + ' bytes');
        }
        delete this.connection_state[connection.id];
    };

    /**
     * Deal with errors on a specific socket
     */
    TestSocketServer.prototype.on_connection_error = function(connection, err) {
        logger.log('TestSocketServer.on_connection_error: Error occurred: ' + util.inspect(err));
        this.on_connection_end(connection);
    };

    /**
     * Send the FIN packet to the client.
     */
    TestSocketServer.prototype.close_connection = function(connection) {
        logger.log('TestSocketServer.close_connection: Closing connection: ' + connection.id);
        connection.end();
    };

    /**
     * For each connection, keep a reference to its FrameBuffer.  This actually isn't really
     * required (we can assign an anonymous FrameBuffer to each connection using a closure),
     * but gives us access to the FrameBuffer "just in case".
     */
    TestSocketServer.prototype.save_connection_state = function(connection) {
        var fb;
        if (this.connection_state[connection.id]) {
            throw new Error('TestSocketServer.save_connection_state: Already found connection: ' + connection.id);
        }
        fb = new FramingBuffer();
        this.connection_state[connection.id] = {
            connection: connection,
            frame_buffer: fb
        };
        return fb;
    };

    /**
     * Laziness
     */
    function get_remote_addr(connection) {
        return connection.remoteAddress + ':' + connection.remotePort;
    }

    /**
     * Generate a random number in the range
     * min inclusive, max exclusive
     */
    function get_random_number(min, max) {
        return Math.floor((Math.random() * (max - min)) + min);
    }

    return TestSocketServer;

};