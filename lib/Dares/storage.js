/**
 *
 * storage.js
 * ==========
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file implements the data storage.
 *
 */

'use strict';

var assert = require( 'assert' );

var Storage = function (process) {
    if ( !(this instanceof Storage) ) {
        throw new Error( 'Constructor called as a function' );
    }

    //yep, that's the storage, feel free to expand this to e.g. a file system store
    var store = {};
    var owningProcess = process;

    //#! just to access the store via debugger conveniently
    this.store = store;

    //##write
    //input parameters:
    //
    // * `key:` the key to write, ...
    //
    // * `value:` ... its value ...
    //
    // * `version:` ... and version
    this.write = function ( key, value, version ) {
        if ( store[key] ) {
            assert( !store[key].writable, 'write called without acquiring the needed locks' );
            assert( version > store[key].version || typeof store[key].version === 'undefined',
                'newly written version should be greater than the old one. Version: ' +
                    version + ' stored version: ' + store[key].version );

            store[key].value = value;
            store[key].version = version;

            owningProcess.emit('change', {key: key, value: value, version: version, timestamp: Date.now()});
        } else {
            store[key] = {value: value,
                version: version,
                readable: false,
                writable: false};

            owningProcess.emit('newKey', {key: key, value: value, version: version, timestamp: Date.now()});
        }
        return true;
    };

    //##patch
    //input parameters:
    //
    // * `patch:` patch of key, value, version data to write, with
    //
    //   * `patch[key].value:` the keys value ...
    //
    //   * `patch[key].version:` ... and version
    //
    // this function writes all data contained in the patch to the store
    this.patch = function ( patch ) {
        for ( var key in patch ) {
            if ( patch.hasOwnProperty( key ) ) {
                this.write( key, patch[key].value, patch[key].version );
            }
        }
    };


    //##read
    //input parameter:
    //
    // * `key:` the key to read
    this.read = function ( key ) {
        if ( store[key] ) {
            assert(!store[key].readable, 'read called without acquiring the needed locks');
            return {value: store[key].value,
                version: store[key].version};
        } else {
            return {};
        }
    };

    //##multiRead
    //input parameter:
    //
    // * `keys:` array of keys to read
    //
    // this function reads every key in the array and
    // returns a `patch` as defined above
    this.multiRead = function ( keys ) {
        var res = {};

        for ( var i = 0; i < keys.length; i++ ) {
            var key = keys[i];
            res[key] = this.read( key );
        }
        return res;
    };

    //##lockWrite
    //input parameter:
    //
    // * `key:` the key to lock
    //
    // sets a flag for the key to not be written
    this.lockWrite = function ( key ) {
        if ( store[key] ) {
            assert( store[key].writable, 'write lock is not available' );
            store[key].writable = false;
        } else {
            store[key] = {writable: false,
                readable: true,
                value: null,
                version: -1};
            owningProcess.emit('newKey', {key: key, value: null, version: -1, timestamp: Date.now()});
        }
    };

    //##unlockWrite
    //input parameter:
    //
    // * `key:` the key to unlock
    //
    // sets a flag for the key to allow it to be written
    this.unlockWrite = function ( key ) {
        if ( store[key] ) {
            store[key].writable = true;
        } else {
            store[key] = {
                writable: true,
                readable: true,
                value: null,
                version: -1
            };
            owningProcess.emit('newKey', {key: key, value: null, version: -1, timestamp: Date.now()});
        }
    };

    //##lockRead
    //input parameter:
    //
    // * `key:` the key to lock
    //
    // sets a flag for the key to not be read
    this.lockRead = function ( key ) {
        if ( store[key] ) {
            assert( store[key].readable, 'read lock is not available' );
            store[key].readable = false;
        } else {
            store[key] = {readable: false,
                writable: true,
                value: null,
                version: -1
            };
            owningProcess.emit('newKey', {key: key, value: null, version: -1, timestamp: Date.now()});
        }
    };

    //##unlockRead
    //input parameter:
    //
    // * `key:` the key to unlock
    //
    // sets a flag for the key to allow it to be read
    this.unlockRead = function ( key ) {
        if ( store[key] ) {
            store[key].readable = true;
        } else {
            store[key] = {
                readable: true,
                writable: true,
                value: null,
                version: -1
            };
            owningProcess.emit('newKey', {key: key, value: null, version: -1, timestamp: Date.now()});
        }
    };

    //##getVersion
    //input parameter:
    //
    // * `key:` the key to check
    //
    // return the keys version or -1 if key is not used
    this.getVersion = function ( key ) {
        if ( store[key] ) {
            return store[key].version;
        } else {
            return -1;
        }
    };

    //##canWrite
    //input parameter:
    //
    // * `key:` the key to check
    //
    // returns the writable flag for this key
    this.canWrite = function ( key ) {
        if ( store[key] ) {
            return store[key].writable && store[key].readable;
        } else {
            return true;
        }
    };

    //##canRead
    //input parameter:
    //
    // * `key:` the key to check
    //
    // returns the readable flag for this key
    this.canRead = function ( key ) {
        if ( store[key] ) {
            return store[key].readable && store[key].writable;
        } else {
            return true;
        }
    };

    //##anyOneLocked
    //returns a flag whether any key has a read or write lock
    this.anyOneLocked = function () {
        for ( var key in store ) {
            if ( store.hasOwnProperty( key ) ) {
                if ( !(store[key].readable && store[key].writable) ) {
                    return true;
                }
            }
        }
        return false;
    };


    //##allLocked
    //returns a flag whether every key has a read or write lock
    this.allLocked = function () {
        for ( var key in store ) {
            if ( store.hasOwnProperty( key ) ) {
                if ( store[key].readable || store[key].writable ) {
                    return false;
                }
            }
        }
        return true;
    };


    //##lockAll
    //locks read and write for the complete store
    this.lockAll = function () {
        for ( var key in store ) {
            if ( store.hasOwnProperty( key ) ) {
                assert( store[key].readable && store[key].writable, 'some locks are not available' );
                store[key].writable = false;
                store[key].readable = false;
                if ( typeof store[key].version === 'undefined' ) {
                    store[key].value = null;
                    store[key].version = -1;
                }
            }
        }
    };

    //##unlockAll
    //unlocks read and write for the complete store
    this.unlockAll = function () {
        for ( var key in store ) {
            if ( store.hasOwnProperty( key ) ) {
                store[key].writable = true;
                store[key].readable = true;
            }
        }
    };

    //##getKeyVersions
    //returns an object, containing all keys with their corresponding version
    this.getKeyVersions = function () {
        var result = {};
        for ( var key in store ) {
            if ( store.hasOwnProperty( key ) ) {
                result[key] = {version: store[key].version};
            }
        }
        return result;
    };

    //##getAll
    //currently just a convenience function for testing
    this.getAll = function () {
        return store;
    };
};

module.exports = Storage;
