'use strict';

/**
 * Just returns a list of known signalling servers
 */
function StaticSignallingServerService(signallingServers) {
    
    this.getSignallingServerSpecs = function () {
        return signallingServers;
    };
}

module.exports = StaticSignallingServerService;