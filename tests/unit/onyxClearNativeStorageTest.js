import AsyncStorageMock from '@react-native-async-storage/async-storage';
import Storage from '../../lib/storage';
import waitForPromisesToResolve from '../utils/waitForPromisesToResolve';

const ONYX_KEYS = {
    DEFAULT_KEY: 'defaultKey',
};

jest.useFakeTimers();

const storageCallResolveList = [];
function addStorageCallResolve(name) {
    storageCallResolveList.push(name);
}

function storageCallResolveOrder(methodName) {
    return storageCallResolveList.indexOf(methodName) + 1;
}

const storageCallQueue = [];

// Mock clear to wait for promises and add a delay
Storage.clear = jest.fn(() => Promise.all(storageCallQueue)
    .then(() => {
        const clearPromise = new Promise(resolve => setTimeout(resolve, 500))
            .then(() => AsyncStorageMock.clear())
            .then(addStorageCallResolve('clear'));
        storageCallQueue.push(clearPromise);
        return clearPromise;
    }));

// Mock setItem to wait for promises
Storage.setItem = jest.fn(() => Promise.all(storageCallQueue)
    .then(() => {
        const setItemPromise = AsyncStorageMock.setItem()
            .then(addStorageCallResolve('setItem'));
        storageCallQueue.push(setItemPromise);
        return setItemPromise;
    }));

describe('Set data while storage is clearing', () => {
    let connectionID;
    let Onyx;

    /** @type OnyxCache */
    let cache;

    beforeAll(() => {
        Onyx = require('../../index').default;
        Onyx.init({
            keys: ONYX_KEYS,
            registerStorageEventListener: () => {},
            initialKeyStates: {
                [ONYX_KEYS.DEFAULT_KEY]: 'default',
            },
        });
    });

    // Always use a "fresh" cache instance
    beforeEach(() => {
        cache = require('../../lib/OnyxCache').default;
    });

    afterEach(() => {
        Onyx.disconnect(connectionID);
        Onyx.clear();
        jest.runAllTimers();
    });

    it('should store merged values when calling merge on a default key after clear', () => {
        let defaultValue;
        connectionID = Onyx.connect({
            key: ONYX_KEYS.DEFAULT_KEY,
            initWithStoredValues: false,
            callback: val => defaultValue = val,
        });
        Storage.clear = jest.fn(() => {
            // Merge after the cache has cleared but before the storage actually clears
            Onyx.merge(ONYX_KEYS.DEFAULT_KEY, 'merged');
            const clearPromise = new Promise(resolve => setTimeout(resolve, 500))
                .then(() => AsyncStorageMock.clear())
                .then(addStorageCallResolve('clear'));
            storageCallQueue.push(clearPromise);
            return clearPromise;
        });
        Onyx.clear();
        jest.runAllTimers();
        waitForPromisesToResolve()
            .then(() => {
                expect(storageCallResolveOrder('clear')).toBe(1);
                expect(storageCallResolveOrder('setItem')).toBe(2);
                expect(defaultValue).toEqual('merged');
                const cachedValue = cache.getValue(ONYX_KEYS.DEFAULT_KEY);
                expect(cachedValue).toEqual('merged');
                Storage.clear.mockRestore();
            });
    });
});