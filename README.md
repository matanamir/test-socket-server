# test-socket-server

A socket server for testing clients.  Still a work-in-progress since i'll be adding to this as needed to test client
functionality.

It expects the data to be sent in the following format:

|frame_size|rpc id|   data    |
|:--------:|:----:|:---------:|
|    32    |  32  | *ignored* |


And returns random data between 100 and 2048 bytes in the following format:

|frame_size|rpc id|random data|
|:--------:|:----:|:---------:|
|    32    |  32  | 100-2048  |

Data is sent in Big-endian.

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
