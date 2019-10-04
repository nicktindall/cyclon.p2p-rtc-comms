import {Promise} from 'bluebird';
import {CyclonNode, CyclonNodePointer} from 'cyclon.p2p';
import {AsyncExecService, Logger} from 'cyclon.p2p-common';
import {Channel} from 'cyclon.p2p-rtc-client/lib/Channel';

const SHUFFLE_RESPONSE_TIMEOUT_MS: number = 30000;

class OutgoingShuffleState {

    private lastOutstandingPromise?: Promise<any>;
    private channelClosingTimeoutId?: number;
    private channel?: Channel;

    constructor(private readonly fromNode: CyclonNode,
                private readonly destinationNodePointer: CyclonNodePointer,
                private readonly shuffleSet: CyclonNodePointer[],
                private readonly asyncExecService: AsyncExecService,
                private readonly logger: Logger) {
    }

    /**
     * Store the channel for later use
     */
    storeChannel(theChannel: Channel): void {
        this.channel = theChannel;
    }

    /**
     * Send a shuffle request
     *
     * @returns {Promise}
     */
    sendShuffleRequest(): void {
        this.requireChannel().send("shuffleRequest", this.shuffleSet);
        this.logger.debug("Sent shuffle request to " + this.destinationNodePointer.id + " : " + JSON.stringify(this.shuffleSet));
    }

    /**
     * Receive and process a shuffle response
     */
    processShuffleResponse(): Promise<void> {
        this.lastOutstandingPromise = this.requireChannel().receive("shuffleResponse", SHUFFLE_RESPONSE_TIMEOUT_MS)
            .then((shuffleResponseMessage) => {
                this.logger.debug("Received shuffle response from " + this.destinationNodePointer.id + " : " + JSON.stringify(shuffleResponseMessage));
                this.fromNode.handleShuffleResponse(this.destinationNodePointer, shuffleResponseMessage);
            });

        return this.lastOutstandingPromise;
    }

    /**
     * Send an acknowledgement we received the response
     */
    sendResponseAcknowledgement(): Promise<void> {
        this.lastOutstandingPromise = new Promise((resolve) => {
            this.requireChannel().send("shuffleResponseAcknowledgement");

            //
            // Delay closing connection to allow acknowledgement to be sent (?)
            //
            this.channelClosingTimeoutId = this.asyncExecService.setTimeout(() => {
                resolve();
            }, 3000);
        })
        .cancellable()
        .catch(Promise.CancellationError, (e) => {
            this.clearChannelClosingTimeout();
            throw e;
        });

        return this.lastOutstandingPromise;
    }

    /**
     * Cleanup any resources
     */
    close(): void {
        if(this.channel) {
            this.channel.close();
        }
        this.clearChannelClosingTimeout();
        delete this.lastOutstandingPromise;
    }

    /**
     * Cancel any currently outstanding promises
     */
    cancel(): void {
        if (this.lastOutstandingPromise && this.lastOutstandingPromise.isPending()) {
            this.lastOutstandingPromise.cancel();
        }
    }

    private clearChannelClosingTimeout(): void {
        if (this.channelClosingTimeoutId) {
            this.asyncExecService.clearTimeout(this.channelClosingTimeoutId);
            delete this.channelClosingTimeoutId;
        }
    }

    private requireChannel(): Channel {
        if (this.channel === undefined) {
            throw new Error("Channel must have been stored first!");
        }
        return this.channel;
    }
}

module.exports = OutgoingShuffleState;