'use strict';

var EventEmitter = require("events").EventEmitter;
var Utils = require("cyclon.p2p").Utils;

var DELAY_BEFORE_RETRY_MS = 1000 * 5;
var LAST_CONNECTED_SERVERS_KEY = "CyclonJSLastConnectedServerList";
var INTERVAL_BETWEEN_SERVER_CONNECTIVITY_CHECKS = 30 * 1000;
var ANCIENT_TIMESTAMP_MILLISECONDS_SINCE_EPOCH = new Date("October 6, 1980 02:20:00").getTime();

/**
 * Maintains connections to up to a specified number of signalling servers
 * via socket.io and emits signalling messages received on them
 *
 * @param preferredNumberOfSockets
 * @param signallingServerService
 * @param loggingService
 * @param socketFactory
 * @param asyncExecService
 * @constructor
 */
function RedundantSignallingSocket(preferredNumberOfSockets, signallingServerService, socketFactory, loggingService, asyncExecService) {

    Utils.checkArguments(arguments, 5);

    var connectivityIntervalId = null;
    var connectedSockets = {};
    var connectedSpecs = {};
    var lastDisconnectTimes = {};
    var randomSortValues = {};
    var node;
    var myself = this;

    // We should only ever have one answer, and one offer listener
    myself.setMaxListeners(2);

    /**
     * Populate the local node and start listening for action
     *
     * @param localNode
     */
    this.initialize = function (localNode) {
        node = localNode;
        connectAndMonitor();
    };

    /**
     * Schedule periodic server connectivity checks
     */
    function scheduleServerConnectivityChecks() {
        if (connectivityIntervalId === null) {
            connectivityIntervalId = asyncExecService.setInterval(function () {
                updateRegistrations();
                connectToServers();
            }, INTERVAL_BETWEEN_SERVER_CONNECTIVITY_CHECKS);
        }
        else {
            throw new Error("BUG ::: Attempt was made to start connectivity checks twice");
        }
    }

    /**
     * Update our registrations with the servers
     * we're connected to
     */
    function updateRegistrations() {
        for (var key in connectedSockets) {
            sendRegisterMessage(connectedSockets[key], node);
        }
    }

    /**
     * Stop periodic connectivity checks
     */
    function stopConnectivityChecks() {
        asyncExecService.clearInterval(connectivityIntervalId);
        connectivityIntervalId = null;
    }

    function connectAndMonitor() {
        connectToServers();
        scheduleServerConnectivityChecks();
    }

    /**
     * Get the list of server specs we're currently listening on
     *
     * @returns {Array}
     */
    this.getCurrentServerSpecs = function () {
        var specs = [];
        for (var spec in connectedSpecs) {
            specs.push(connectedSpecs[spec]);
        }
        return specs;
    };

    /**
     * Connect to servers if we're not connected to enough
     */
    function connectToServers() {
        var knownServers = filterAndSortAvailableServers(signallingServerService.getSignallingServerSpecs());

        for (var i = 0; i < knownServers.length; i++) {
            var connectionsRemaining = preferredNumberOfSockets - Object.keys(connectedSockets).length;

            //
            // We have enough connections
            //
            if (connectionsRemaining === 0) {
                break;
            }

            //
            // Try to connect to a new server
            //
            var serverSpec = knownServers[i];
            if (!currentlyConnectedToServer(serverSpec)) {
                var socket;
                try {
                    socket = socketFactory.createSocket(serverSpec);
                    storeSocket(serverSpec, socket);
                    addListeners(socket, serverSpec);
                    loggingService.info("Attempting to connect to signalling server (" + serverSpec.signallingApiBase + ")");
                }
                catch (error) {
                    loggingService.error("Error connecting to socket " + serverSpec.signallingApiBase, error);
                }
            }

            //
            // Store the new set of connected servers in session storage so we
            // can prefer them in the event of a reload
            //
            setLastConnectedServers(getListOfCurrentSignallingApiBases());
        }
    }

    /**
     * Return a copy of the known server array sorted in the order of
     * their last-disconnect-time. Due to the fact a failed connect is
     * considered a disconnect, this will cause servers to be tried in
     * a round robin pattern.
     */
    function filterAndSortAvailableServers(serverArray) {
        var copyOfServerArray = JSON.parse(JSON.stringify(serverArray));
        copyOfServerArray.sort(function (itemOne, itemTwo) {
            return sortValue(itemOne) - sortValue(itemTwo);
        });

        // Filter servers we've too-recently disconnected from
        return copyOfServerArray.filter(function (item) {
            var lastDisconnectTime = lastDisconnectTimes[item.signallingApiBase];
            return lastDisconnectTime === undefined || new Date().getTime() - lastDisconnectTime > DELAY_BEFORE_RETRY_MS;
        });
    }

    /**
     * Return the value to be used in the ascending sort of
     * server specs. It will use the last disconnect time if it's
     * present, or a random number guaranteed to be prior to the
     * first disconnect time, to randomise the order servers are
     * tried initially.
     *
     * @param serverSpec
     */
    function sortValue(serverSpec) {
        var signallingApiBase = serverSpec.signallingApiBase;
        return lastDisconnectTimes[signallingApiBase] || getRandomSortValue(signallingApiBase);
    }

    /**
     * Generate a CONSISTENT (for a given signallingApiBase) random timestamp well in the past
     */
    function getRandomSortValue(signallingApiBase) {
        var value;

        // Prefer servers we were connected to before a reload
        if (getLastConnectedServers().indexOf(signallingApiBase) >= 0) {
            return 0;
        }

        if (randomSortValues.hasOwnProperty(signallingApiBase)) {
            value = randomSortValues[signallingApiBase];
        }
        else {
            value = randomSortValues[signallingApiBase] = Math.floor(Math.random() * ANCIENT_TIMESTAMP_MILLISECONDS_SINCE_EPOCH);
        }
        return value;
    }

    /**
     * Are we currently connected to the specified server?
     *
     * @param serverSpec
     * @returns {boolean}
     */
    function currentlyConnectedToServer(serverSpec) {
        return connectedSockets.hasOwnProperty(serverSpec.signallingApiBase);
    }

    /**
     * Return the list of signallingApiBase values for the current set
     * of signalling servers
     *
     * @returns {Array}
     */
    function getListOfCurrentSignallingApiBases() {
        return Object.keys(connectedSpecs);
    }

    /**
     * Delete a socket from the local store
     *
     * @param spec
     * @param socket
     */
    function storeSocket(spec, socket) {
        connectedSpecs[spec.signallingApiBase] = spec;
        connectedSockets[spec.signallingApiBase] = socket;
    }

    /**
     * Delete the socket from the local store
     *
     * @param apiBase
     */
    function deleteSocket(apiBase) {
        delete connectedSpecs[apiBase];
        delete connectedSockets[apiBase];
        lastDisconnectTimes[apiBase] = new Date().getTime();
    }

    /**
     * Add listeners for a socket
     *
     * @param socket
     * @param serverSpec
     */
    function addListeners(socket, serverSpec) {
        var apiBase = serverSpec.signallingApiBase;
        var disposeFunction = disposeOfSocket(apiBase);
        var registerFunction = register(socket, node);

        // Register if we connect
        socket.on("connect", registerFunction);

        // Dispose if we disconnect/fail to connect/error
        socket.io.on("connect_error", disposeFunction);
        socket.on("error", disposeFunction);
        socket.on("disconnect", disposeFunction);

        /**
         * Emit offers/answers to the node
         */
        socket.on("answer", emitAnswer);
        socket.on("offer", emitOffer);
    }

    /**
     * Return a closure that will dispose of a socket
     *
     * @param apiBase
     * @returns {Function}
     */
    function disposeOfSocket(apiBase) {
        return function () {
            loggingService.warn("Got disconnected from signalling server (" + apiBase + ")");

            var socket = connectedSockets[apiBase];
            if (socket) {
                stopConnectivityChecks();
                socket.removeAllListeners();
                socket.io.removeAllListeners();
                try {
                    socket.disconnect();
                }
                catch (ignore) {
                }
                deleteSocket(apiBase);
                connectAndMonitor();
            }
            else {
                throw new Error("BUG ::: Disconnected from a socket we're not connected to?!");
            }
        };
    }

    /**
     * Tell the signalling server who we are
     *
     * @param socket
     * @param node
     * @returns {Function}
     */
    function register(socket, node) {
        return function () {
            sendRegisterMessage(socket, node);
        };
    }

    function sendRegisterMessage(socket, node) {
        socket.emit("register", node.createNewPointer());
    }

    function emitAnswer(message) {
        myself.emit("answer", message);
    }

    function emitOffer(message) {
        myself.emit("offer", message);
    }

    /**
     * Store the last connected signalling servers so they can be
     * re-connected to on a reload
     */
    function setLastConnectedServers(apiUrls) {
        sessionStorage.setItem(LAST_CONNECTED_SERVERS_KEY, apiUrls);
    }

    /**
     * Gets the list of last connected servers (if available) from
     * session storage
     *
     * @returns {*}
     */
    function getLastConnectedServers() {
        var storedValue = sessionStorage.getItem(LAST_CONNECTED_SERVERS_KEY);
        return storedValue || [];
    }
}

RedundantSignallingSocket.prototype = Object.create(EventEmitter.prototype);

module.exports = RedundantSignallingSocket;