# test-socket-server

[![Build Status](https://travis-ci.org/matanamir/test-socket-server.png)](https://travis-ci.org/matanamir/test-socket-server)

A framing socket server for testing clients.  Still a work-in-progress since i'll be adding to this as needed to test client
functionality.

It expects the data to be sent in the following format:

|frame_size|rpc id|   data    |
|:--------:|:----:|:---------:|
|    4     |  4   | *ignored* |


And returns random data between 100 and 2048 bytes in the following format:

|frame_size|rpc id|random data|
|:--------:|:----:|:---------:|
|    4     |  4   | 100-2048  |

Data is sent in Big-endian.

## Usage

Instantiate the TestSocketServer with some parameters to control how it behaves:

```js
var TestSocketServer = require('test-socket-server');

// use defaults
var server = new TestSocketServer();

// or set some specific behavior so the server gets "stuck" before it sends a response
// as stays stuck for 10000ms.
var server = new TestSocketServer({
    stuck_ms: 10000,
    stuck_before_response: true
});

// connect to it....

```

The default options are:

```js
{
    timeout_ms: 60000,
    stuck_ms: 30000,
    stuck_before_response: false,
    stuck_partial_response: false,
    stuck_action: null
}
```

And the explanation for each parameter:

### Start up parameters

*timeout_ms*: Main socket timeout.  If no activity occurs on a socket for this time,
it will close the connection.

*stuck_ms*: Amount of time to stay "stuck" if one of the stuck situations is enabled

*stuck_before_response*: Server will stop sending data (stuck) after receiving a request
and before a response is sent for stuck_ms. This does not drop the connection until the
timeout_ms passes or the client ends the connection.

*stuck_partial_response*: Server will stop sending data (stuck) after receiving a request
and after partial response data is sent for stuck_ms. This does not drop the connection until
the timeout_ms passes or the client ends the connection.

*stuck_action*: A function to call when the server gets "stuck".  By default (null) it does
nothing but wait till the stuck_ms expires.  Note that the stuck_ms timeout is still in effect
even if an action is provided.  It is passed the connection object as a parameter.

## Install

```
npm install test-socket-server
```

## Test

### Functional Tests

Use this to run some basic functional tests:

```
npm test
```

## License

MIT License
