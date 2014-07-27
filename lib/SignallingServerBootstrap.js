'use strict';

var url = require('url');
var Promise = require("bluebird");
var Utils = require("cyclon.p2p-common");

function SignallingServerBootstrap(signallingSocket, httpRequestService) {

    Utils.checkArguments(arguments, 2);

    var API_PATH = "./api/peers";

    /**
     * Fetch a list of registered peers from the server
     */
    this.getInitialPeerSet = function (cyclonNode, limit) {

        var serverSpecs = signallingSocket.getCurrentServerSpecs();
        if (serverSpecs.length > 0) {
            return new Promise(function (resolve, reject) {

                var specPromises = serverSpecs.map(function (serverSpec) {
                    return getInitialPeerSetFromServer(cyclonNode, serverSpec, limit);
                });
                Promise.settle(specPromises).then(function (results) {
                    resolve(results.reduce(function (current, next) {
                        if (next.isFulfilled()) {
                            return current.concat(next.value());
                        }
                        else {
                            return current;
                        }
                    }, []));
                }).catch(reject);
            });
        }

        return Promise.reject(new Error("Not connected to any signalling servers, can't bootstrap"));
    };

    function getInitialPeerSetFromServer(cyclonNode, serverSpec, limit) {
        return new Promise(function (resolve, reject) {
            httpRequestService.get(generateUrl(serverSpec.signallingApiBase, limit)).then(function (response) {
                var cacheEntries =
                    Object.keys(response).filter(function (peerId) {
                        return peerId !== cyclonNode.getId();
                    }).map(function (peerId) {
                            return response[peerId];
                        });

                resolve(cacheEntries);
            }).catch(reject);
        });
    }

    function generateUrl(apiBase, limit) {
        //noinspection JSCheckFunctionSignatures
        return url.resolve(apiBase, API_PATH) + "?limit=" + limit + "&nocache=" + new Date().getTime();
    }
}

module.exports = SignallingServerBootstrap;