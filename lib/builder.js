'use strict';

var cyclon = require("cyclon.p2p");
var rtc = require("cyclon.p2p-rtc-client");
var Utils = require("cyclon.p2p-common");
var WebRTCComms = require("./WebRTCComms");
var ShuffleStateFactory = require("./ShuffleStateFactory");
var SignallingServerBootstrap = require("./SignallingServerBootstrap");

var ICE_CANDIDATES_BATCHING_DELAY_MS = 1000;

function WebRTCCyclonNodeBuilder(logger, metadataProviders, signallingServers, iceServers, storage) {

    Utils.checkArguments(arguments, 5);

    var asyncExecService = Utils.asyncExecService();
    var timingService = new rtc.TimingService();

    var redundantSignallingSocket = new rtc.RedundantSignallingSocket(
        new rtc.StaticSignallingServerService(signallingServers),
        new rtc.SocketFactory(),
        logger,
        asyncExecService,
        storage,
        timingService);

    var httpRequestService = new rtc.HttpRequestService();

    var signallingService = new rtc.IceCandidateBatchingSignallingService(
        asyncExecService,
        new rtc.SocketIOSignallingService(
            redundantSignallingSocket,
            logger,
            httpRequestService,
            storage),
        ICE_CANDIDATES_BATCHING_DELAY_MS);

    var webRtcComms = new WebRTCComms(
        new rtc.RTC(
            signallingService,
            new rtc.ChannelFactory(
                asyncExecService,
                new rtc.PeerConnectionFactory(
                    new rtc.AdapterJsRTCObjectFactory(logger),
                    asyncExecService,
                    logger,
                    iceServers),
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
        .withStorage(storage)
        .withMetadataProviders(metadataProviders)
        .build();
}

module.exports.create = function (logger, metadataProviders, signallingServers, iceServers, storage) {
    return new WebRTCCyclonNodeBuilder(logger, metadataProviders, signallingServers, iceServers, storage);
};

module.exports.ShuffleStateFactory = ShuffleStateFactory;
module.exports.SignallingServerBootstrap = SignallingServerBootstrap;
module.exports.WebRTCComms = WebRTCComms;