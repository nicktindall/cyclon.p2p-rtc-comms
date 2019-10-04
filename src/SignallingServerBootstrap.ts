'use strict';

import url from 'url';
import {Promise} from 'bluebird';
import {randomSample} from 'cyclon.p2p-common';
import {SignallingSocket} from 'cyclon.p2p-rtc-client/lib/SignallingSocket';
import {HttpRequestService} from 'cyclon.p2p-rtc-client';
import {CyclonNode, CyclonNodePointer} from 'cyclon.p2p';
import {SignallingServerSpec} from 'cyclon.p2p-rtc-client/lib/SignallingServerSpec';

const API_PATH = "./api/peers";

export class SignallingServerBootstrap {

    constructor(private readonly signallingSocket: SignallingSocket,
                private readonly httpRequestService: HttpRequestService) {
    }

    /**
     * Fetch a list of registered peers from the server
     */
    getInitialPeerSet(cyclonNode: CyclonNode, limit: number): Promise<any> {

        const serverSpecs = this.signallingSocket.getCurrentServerSpecs();
        if (serverSpecs.length > 0) {

            const specPromises = serverSpecs.map((serverSpec) => {
                return this.getInitialPeerSetFromServer(cyclonNode, serverSpec, limit);
            });

            return Promise.settle(specPromises).then((results) => {
                const allResults = SignallingServerBootstrap.collateSuccessfulResults(results);
                return randomSample(SignallingServerBootstrap.deDuplicatePeerList(allResults), limit);
            });
        }

        return Promise.reject(new Error("Not connected to any signalling servers, can't bootstrap"));
    }

    private static collateSuccessfulResults(arrayOfPromises: Promise.Inspection<CyclonNodePointer[]>[]): CyclonNodePointer[] {
        return arrayOfPromises.reduce((current: CyclonNodePointer[], next: Promise.Inspection<CyclonNodePointer[]>) => {
            if (next.isFulfilled()) {
                return current.concat(next.value());
            }
            else {
                return current;
            }
        }, []);
    }

    private static deDuplicatePeerList(arrayOfPeers: CyclonNodePointer[]): CyclonNodePointer[] {
        const peerMap: { [id:string]: CyclonNodePointer } = {};

        arrayOfPeers.forEach(function (peer) {
            if (peerMap.hasOwnProperty(peer.id)) {
                if (peerMap[peer.id].seq < peer.seq) {
                    peerMap[peer.id] = peer;
                }
            }
            else {
                peerMap[peer.id] = peer;
            }
        });

        const uniquePeers = [];
        for (const nodeId in peerMap) {
            uniquePeers.push(peerMap[nodeId]);
        }
        return uniquePeers;
    }

    private getInitialPeerSetFromServer(cyclonNode: CyclonNode, serverSpec: SignallingServerSpec, limit: number): Promise<CyclonNodePointer[]> {
        return this.httpRequestService.get(SignallingServerBootstrap.generateUrl(serverSpec.signallingApiBase, limit)).then((response: {[id: string]: CyclonNodePointer}) => {
            return Object.keys(response).filter((peerId) => {
                return peerId !== cyclonNode.getId();
            }).map((peerId) => {
                return response[peerId];
            });
        });
    }

    // TODO room(s) should be configurable
    private static generateUrl(apiBase: string, limit: number): string {
        //noinspection JSCheckFunctionSignatures
        return url.resolve(apiBase, API_PATH) + "?room=CyclonWebRTC&limit=" + limit + "&nocache=" + new Date().getTime();
    }
}
