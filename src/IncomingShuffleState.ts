import {CyclonNode, CyclonNodePointer} from 'cyclon.p2p';
import {AsyncExecService, Logger, TimeoutError} from 'cyclon.p2p-common';
import {Channel} from 'cyclon.p2p-rtc-client';

const SHUFFLE_REQUEST_TIMEOUT_MS = 15000;
const SHUFFLE_RESPONSE_ACKNOWLEDGEMENT_TIMEOUT_MS = 15000;

export class IncomingShuffleState {

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
    async processShuffleRequest(channel: Channel): Promise<void> {
        let shuffleRequestMessage = await channel.receive("shuffleRequest", SHUFFLE_REQUEST_TIMEOUT_MS);
        this.logger.debug("Received shuffle request from " + this.sourcePointer.id + " : " + JSON.stringify(shuffleRequestMessage));
        const response = this.localNode.handleShuffleRequest(this.sourcePointer, shuffleRequestMessage);
        channel.send("shuffleResponse", response);
        this.logger.debug("Sent shuffle response to " + this.sourcePointer.id);
    }

    /**
     * Wait for an acknowledgment that our shuffle response
     * was received (to prevent prematurely closing the data channel)
     */
    async waitForResponseAcknowledgement(channel: Channel): Promise<Channel | null> {
        try {
            return await channel.receive("shuffleResponseAcknowledgement", SHUFFLE_RESPONSE_ACKNOWLEDGEMENT_TIMEOUT_MS);
        } catch (error) {
            if (error instanceof TimeoutError) {
                this.logger.warn("Timeout occurred waiting for response acknowledgement, continuing");
            } else {
                this.logger.error('An unknown error occurred waiting for response acknowledgement, continuing', error);
            }
            return null;
        }
    }
}
