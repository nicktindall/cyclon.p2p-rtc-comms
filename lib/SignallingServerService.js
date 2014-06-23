'use strict';

/**
 * Just returns a list of known signalling servers
 */
function SignallingServerService() {

    /**
     * Signalling server definitions look like
     *
     *  {
     *      socket: {
     *          server: "http://localhost:2222",
     *          socketResource: 'socket.io'
     *      },
     *      signallingApiBase: 'http://localhost:2222/'
     *  }
     *
     *  where;
     *      socket.server           : is the socket.io server to listen on
     *      socket.socketResource   : is the (optional) path to socket io, it defaults to 'socket.io'
     *      signallingApiBase       : is the signalling API base URL to which offer/answer POSTs are to be sent
     */
    var knownSignallingServers = [
        {
            socket: {
                server: "http://localhost:12345"
            },
            signallingApiBase: 'http://localhost:12345/'
        },
        {
            socket: {
                server: "http://localhost:12346"
            },
            signallingApiBase: 'http://localhost:12346/'
        },
        {
            socket: {
                server: "http://localhost:12347"
            },
            signallingApiBase: 'http://localhost:12347/'
        }
    ];

    this.getSignallingServerSpecs = function () {
        return knownSignallingServers;
    };
}

module.exports = SignallingServerService;