import {Promise}  from 'bluebird';
import {CyclonNode, CyclonNodePointer} from 'cyclon.p2p';
import {AsyncExecService, Logger} from 'cyclon.p2p-common';
import {Channel} from 'cyclon.p2p-rtc-client/lib/Channel';

const SHUFFLE_REQUEST_TIMEOUT_MS = 15000;
const SHUFFLE_RESPONSE_ACKNOWLEDGEMENT_TIMEOUT_MS = 15000;

class IncomingShuffleState {

    private lastOutstandingPromise?: Promise<any>;

    constructor(private readonly localNode: CyclonNode,
                private readonly sourcePointer: CyclonNodePointer,
                private readonly asyncExecService: AsyncExecService,
                private readonly logger: Logger) {
    }

    /**
     * Receive an inbound shuffle
     *
     * @param channel
     */
    processShuffleRequest(channel: Channel): Promise<Channel> {

        this.lastOutstandingPromise = channel.receive("shuffleRequest", SHUFFLE_REQUEST_TIMEOUT_MS)
            .then((shuffleRequestMessage) => {
                this.logger.debug("Received shuffle request from " + this.sourcePointer.id + " : " + JSON.stringify(shuffleRequestMessage));
                const response = this.localNode.handleShuffleRequest(this.sourcePointer, shuffleRequestMessage);
                channel.send("shuffleResponse", response);
                this.logger.debug("Sent shuffle response to " + this.sourcePointer.id);
                return channel;
            }).cancellable();

        return this.lastOutstandingPromise;
    }

    /**
     * Wait for an acknowledgment that our shuffle response
     * was received (to prevent prematurely closing the data channel)
     */
    waitForResponseAcknowledgement(channel: Channel): Promise<Channel> {

        this.lastOutstandingPromise = channel.receive("shuffleResponseAcknowledgement", SHUFFLE_RESPONSE_ACKNOWLEDGEMENT_TIMEOUT_MS)
            .catch(Promise.TimeoutError, () => {
                this.logger.warn("Timeout occurred waiting for response acknowledgement, continuing");
            })
            .then(() => channel);

        return this.lastOutstandingPromise;
    }

    /**
     * Cleanup any resources
     */
    close() {
        delete this.lastOutstandingPromise;
    }

    /**
     * Cancel any currently outstanding promises
     */
    cancel() {
        if (this.lastOutstandingPromise && this.lastOutstandingPromise.isPending()) {
            this.lastOutstandingPromise.cancel();
        }
    }
}

module.exports = IncomingShuffleState;