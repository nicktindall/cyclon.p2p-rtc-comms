const {allSettled} = require("../lib/PromiseTools");

describe('the promise tools', () => {

    describe('allSettled', () => {

        it('returns an array of settled promises once they all complete', async () => {
            const p1 = Promise.reject('error');
            const p2 = Promise.resolve('success');

            const result = await allSettled([p1, p2]);

            expect(result[0].status).toEqual('rejected');
            expect(result[0].reason).toEqual('error');

            expect(result[1].status).toEqual('fulfilled');
            expect(result[1].value).toEqual('success');
        });
    });
});