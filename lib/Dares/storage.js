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
    this.process = process;

    //#! just to access the store via debugger conveniently
    this.store = store;
};

//##write
//input parameters:
//
// * `key:` the key to write, ...
//
// * `value:` ... its value ...
//
// * `version:` ... and version
Storage.prototype.write = function ( key, value, version ) {
    if ( this.store[key] ) {
        assert( !this.store[key].writable, 'write called without acquiring the needed locks' );
        assert( version > this.store[key].version || typeof this.store[key].version === 'undefined',
            'newly written version should be greater than the old one. Version: ' +
                version + ' stored version: ' + this.store[key].version );

        this.store[key].value = value;
        this.store[key].version = version;

        this.process.emit('change', {key: key, value: value, version: version, timestamp: Date.now()});
    } else {
        this.store[key] = {value: value,
            version: version,
            readable: false,
            writable: false};

        this.process.emit('newKey', {key: key, value: value, version: version, timestamp: Date.now()});
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
Storage.prototype.patch = function ( patch ) {
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
Storage.prototype.read = function ( key ) {
    if ( this.store[key] ) {
        assert(!this.store[key].readable, 'read called without acquiring the needed locks');
        return {value: this.store[key].value,
            version: this.store[key].version};
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
Storage.prototype.multiRead = function ( keys ) {
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
Storage.prototype.lockWrite = function ( key ) {
    if ( this.store[key] ) {
        assert( this.store[key].writable, 'write lock is not available' );
        this.store[key].writable = false;
    } else {
        this.store[key] = {writable: false,
            readable: true,
            value: null,
            version: -1};
        this.process.emit('newKey', {key: key, value: null, version: -1, timestamp: Date.now()});
    }
};

//##unlockWrite
//input parameter:
//
// * `key:` the key to unlock
//
// sets a flag for the key to allow it to be written
Storage.prototype.unlockWrite = function ( key ) {
    if ( this.store[key] ) {
        this.store[key].writable = true;
    } else {
        this.store[key] = {
            writable: true,
            readable: true,
            value: null,
            version: -1
        };
        this.process.emit('newKey', {key: key, value: null, version: -1, timestamp: Date.now()});
    }
};

//##lockRead
//input parameter:
//
// * `key:` the key to lock
//
// sets a flag for the key to not be read
Storage.prototype.lockRead = function ( key ) {
    if ( this.store[key] ) {
        assert( this.store[key].readable, 'read lock is not available' );
        this.store[key].readable = false;
    } else {
        this.store[key] = {readable: false,
            writable: true,
            value: null,
            version: -1
        };
        this.process.emit('newKey', {key: key, value: null, version: -1, timestamp: Date.now()});
    }
};

//##unlockRead
//input parameter:
//
// * `key:` the key to unlock
//
// sets a flag for the key to allow it to be read
Storage.prototype.unlockRead = function ( key ) {
    if ( this.store[key] ) {
        this.store[key].readable = true;
    } else {
        this.store[key] = {
            readable: true,
            writable: true,
            value: null,
            version: -1
        };
        this.process.emit('newKey', {key: key, value: null, version: -1, timestamp: Date.now()});
    }
};

//##getVersion
//input parameter:
//
// * `key:` the key to check
//
// return the keys version or -1 if key is not used
Storage.prototype.getVersion = function ( key ) {
    if ( this.store[key] ) {
        return this.store[key].version;
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
Storage.prototype.canWrite = function ( key ) {
    if ( this.store[key] ) {
        return this.store[key].writable && this.store[key].readable;
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
Storage.prototype.canRead = function ( key ) {
    if ( this.store[key] ) {
        return this.store[key].readable && this.store[key].writable;
    } else {
        return true;
    }
};

//##anyOneLocked
//returns a flag whether any key has a read or write lock
Storage.prototype.anyOneLocked = function () {
    for ( var key in this.store ) {
        if ( this.store.hasOwnProperty( key ) ) {
            if ( !(this.store[key].readable && this.store[key].writable) ) {
                return true;
            }
        }
    }
    return false;
};


//##allLocked
//returns a flag whether every key has a read or write lock
Storage.prototype.allLocked = function () {
    for ( var key in this.store ) {
        if ( this.store.hasOwnProperty( key ) ) {
            if ( this.store[key].readable || this.store[key].writable ) {
                return false;
            }
        }
    }
    return true;
};


//##lockAll
//locks read and write for the complete store
Storage.prototype.lockAll = function () {
    for ( var key in this.store ) {
        if ( this.store.hasOwnProperty( key ) ) {
            assert( this.store[key].readable && this.store[key].writable, 'some locks are not available' );
            this.store[key].writable = false;
            this.store[key].readable = false;
            if ( typeof this.store[key].version === 'undefined' ) {
                this.store[key].value = null;
                this.store[key].version = -1;
            }
        }
    }
};

//##unlockAll
//unlocks read and write for the complete store
Storage.prototype.unlockAll = function () {
    for ( var key in this.store ) {
        if ( this.store.hasOwnProperty( key ) ) {
            this.store[key].writable = true;
            this.store[key].readable = true;
        }
    }
};

//##getKeyVersions
//returns an object, containing all keys with their corresponding version
Storage.prototype.getKeyVersions = function () {
    var result = {};
    for ( var key in this.store ) {
        if ( this.store.hasOwnProperty( key ) ) {
            result[key] = {version: this.store[key].version};
        }
    }
    return result;
};

//##getAll
//currently just a convenience function for testing
Storage.prototype.getAll = function () {
    return this.store;
};

module.exports = Storage;
