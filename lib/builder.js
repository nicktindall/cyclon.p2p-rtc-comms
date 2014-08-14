'use strict';

var cyclon = require("cyclon.p2p");
var rtc = require("cyclon.p2p-rtc-client");
var Utils = require("cyclon.p2p-common");
var WebRTCComms = require("./WebRTCComms");
var ShuffleStateFactory = require("./ShuffleStateFactory");
var SignallingServerBootstrap = require("./SignallingServerBootstrap");

var ICE_CANDIDATES_BATCHING_DELAY_MS = 1000;

function WebRTCCyclonNodeBuilder (logger, metadataProviders, signallingServers) {

    Utils.checkArguments(arguments, 3);

    var asyncExecService = Utils.asyncExecService();
    var timingService = new rtc.TimingService();

    var redundantSignallingSocket = new rtc.RedundantSignallingSocket(
                    new rtc.StaticSignallingServerService(signallingServers),
                    new rtc.SocketFactory(),
                    logger,
                    asyncExecService,
                    sessionStorage,
                    timingService);

    var httpRequestService = new rtc.HttpRequestService();

    var signallingService = new rtc.IceCandidateBatchingSignallingService(
        asyncExecService,
        new rtc.SocketIOSignallingService(
            redundantSignallingSocket,
            logger,
            httpRequestService,
            sessionStorage),
        ICE_CANDIDATES_BATCHING_DELAY_MS);

    var webRtcComms = new WebRTCComms(
        new rtc.RTC(
            signallingService,
            new rtc.ChannelFactory(
                asyncExecService,
                new rtc.PeerConnectionFactory(
                    new rtc.AdapterJsRTCObjectFactory(logger),
                    asyncExecService,
                    logger),
                signallingService,
                logger)
        ),
        new ShuffleStateFactory(logger, asyncExecService),
        logger);

    var signallingServerBootstrap = new SignallingServerBootstrap(
        redundantSignallingSocket,
        httpRequestService);

    return cyclon.builder(webRtcComms, signallingServerBootstrap)
        .withLogger(logger)
        .withStorage(sessionStorage)
        .withMetadataProviders(metadataProviders)
        .build();
}

module.exports.create = function(logger, metadataProviders, signallingServers) {
	return new WebRTCCyclonNodeBuilder(logger, metadataProviders, signallingServers);
};
