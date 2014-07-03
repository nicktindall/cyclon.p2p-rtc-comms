'use strict';

var cyclon = require("cyclon.p2p");
var rtc = require("cyclon.p2p-rtc");
var WebRTCComms = require("./WebRTCComms");
var ShuffleStateFactory = require("./ShuffleStateFactory");
var SignallingServerBootstrap = require("./SignallingServerBootstrap");

function WebRTCCyclonNodeBuilder(id, logger, metadataProviders, signallingServers) {
    cyclon.Utils.checkArguments(arguments, 4);

    var asyncExecService = new cyclon.AsyncExecService();

    var redundantSignallingSocket = new rtc.RedundantSignallingSocket(
                    new rtc.StaticSignallingServerService(signallingServers), 
                    new rtc.SocketFactory(), 
                    logger, 
                    asyncExecService);

    var httpRequestService = new rtc.HttpRequestService();

    var signallingService = new rtc.SocketIOSignallingService(
                redundantSignallingSocket, 
                logger, 
                httpRequestService);

    var webRtcComms = new WebRTCComms(
        new rtc.RTC(
            signallingService, 
            new rtc.ChannelFactory(
                asyncExecService, 
                new rtc.PeerConnectionFactory(
                    new rtc.TimingService(), 
                    new rtc.AdapterJsRTCObjectFactory(), 
                    asyncExecService, 
                    logger), 
                signallingService, 
                logger)), 
        new ShuffleStateFactory(logger, asyncExecService), 
        logger);

    var signallingServerBootstrap = new SignallingServerBootstrap(
        redundantSignallingSocket, 
        httpRequestService);

    return cyclon.builder(id, webRtcComms, signallingServerBootstrap)
        .withLogger(logger)
        .withStorage(sessionStorage)
        .withMetadataProviders(metadataProviders)
        .build();
}

module.exports.create = function(id, logger, metadataProviders, signallingServers) {
	return new WebRTCCyclonNodeBuilder(id, logger, metadataProviders, signallingServers);
};