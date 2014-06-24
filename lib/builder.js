'use strict';

var cyclon = require("cyclon.p2p");
var WebRTCComms = require("./WebRTCComms");
var RedundantSignallingSocket = require("./RedundantSignallingSocket");
var PeerConnectionFactory = require("./PeerConnectionFactory");
var TimingService = require("./TimingService");
var NodeJsRTCObjectFactory = require("./NodeJsRTCObjectFactory");
var MessagingUtilities = require("./MessagingUtilities");
var HttpRequestService = require("./HttpRequestService");
var SignallingServerService = require("./SignallingServerService");
var SocketFactory = require("./SocketFactory");
var ShuffleStateFactory = require("./ShuffleStateFactory");
var SocketIOSignallingService = require("./SocketIOSignallingService");
var SignallingServerBootstrap = require("./SignallingServerBootstrap");
var AdapterJsRTCObjectFactory = require("./AdapterJsRTCObjectFactory");
var StaticSignallingServerService = require("./StaticSignallingServerService");

var DEFAULT_PREFERRED_NUMBER_OF_SOCKETS = 2;

/**
 * A builder for WebRTC Cyclon node instances
 */
function WebRTCCyclonBuilder(id) {

	var preferredNumberOfSockets = DEFAULT_PREFERRED_NUMBER_OF_SOCKETS,
		logger = new cyclon.ConsoleLogger(),
		timingService = new TimingService(),
		rtcObjectFactory = new NodeJsRTCObjectFactory(),
		asyncExecService = new cyclon.AsyncExecService(),
		signallingServerService = new SignallingServerService(),
		socketFactory = new SocketFactory(),
		signallingSocket = null,
		storage = new cyclon.InMemoryStorage(),
		httpRequestService = new HttpRequestService(),
		metadataProviders = [];

	this.withPreferredNumberOfSockets = function(newPreferredNumberOfSockets) {
		preferredNumberOfSockets = newPreferredNumberOfSockets;
		return this;
	};

	this.withLogger = function(newLogger) {
		logger = newLogger;
		return this;
	};

	this.withStorage = function(newStorage) {
		storage = newStorage;
		return this;
	};

	this.withMetadataProviders = function(newMetadataProviders) {
		metadataProviders = newMetadataProviders;
		return this;
	};

	this.withRTCObjectFactory = function(newRtcObjectFactory) {
		rtcObjectFactory = newRtcObjectFactory;
		return this;
	};

	this.withSignallingServers = function(newSignallingServers) {
		signallingServerService = new StaticSignallingServerService(newSignallingServers);
		return this;
	};

	this.build = function() {
		if(signallingSocket === null) {
			signallingSocket = new RedundantSignallingSocket(preferredNumberOfSockets, signallingServerService, socketFactory, logger, asyncExecService);
		}
		var signallingService = new SocketIOSignallingService(signallingSocket, logger, httpRequestService);
		var messagingUtilities = new MessagingUtilities(asyncExecService, logger);
		var shuffleStateFactory = new ShuffleStateFactory(logger, asyncExecService, messagingUtilities);
		var peerConnectionFactory = new PeerConnectionFactory(timingService, rtcObjectFactory, asyncExecService, logger)
		var comms = new WebRTCComms(peerConnectionFactory, shuffleStateFactory, signallingService, logger)
		var bootstrap = new SignallingServerBootstrap(signallingSocket, httpRequestService);
		return cyclon.builder(id, comms, bootstrap)
			.withLogger(logger)
			.withAsyncExecService(asyncExecService)
			.withStorage(storage)
			.withMetadataProviders(metadataProviders)
			.build();
	};
};

module.exports.builder = function(id) {
	return new WebRTCCyclonBuilder(id);
};
module.exports.AdapterJsRTCObjectFactory = AdapterJsRTCObjectFactory;