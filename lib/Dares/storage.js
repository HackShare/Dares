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

var Storage = function ( p ) {
    // We use `Object.create( null )` instead of an empty object.
    // Since with an empty object we cann't use keys like 'hasOwnProperty'.
    this.store = Object.create( null );

    this.process = p;
};

/**
 * ##write
 * Writes the specified key.
 *
 * @param {string} key - the key to write ...
 * @param {any} value - ... its value ...
 * @param {number} version - ... and version
 * @return {boolean} Returns true
 */
Storage.prototype.write = function ( key, value, version ) {
    if ( this.store[key] ) {
        if ( this.store[key].writable ) {
            throw new Error( 'write called without acquiring the needed locks' );
        }
        if ( version <= this.store[key].version ) {
            throw new Error( 'newly written version should be greater than the old one. Version: ' +
                version + ' stored version: ' + this.store[key].version );
        }

        this.store[key].value = value;
        this.store[key].version = version;

        this.process.emit( 'change', {
            key: key,
            value: value,
            version: version,
            timestamp: Date.now()
        } );
    } else {
        this.store[key] = {
            value: value,
            version: version,
            readable: false,
            writable: false
        };

        this.process.emit( 'newKey', {
            key: key,
            value: value,
            version: version,
            timestamp: Date.now()
        } );
    }
    return true;
};

/**
 * ##patch
 * This function writes all data contained in the patch to the store.
 *
 * @param {object} patch - patch of key, value, version data to write, with
 *  `patch[key].value the keys value ...  
 *  `patch[key].version` ... and version
 */
Storage.prototype.patch = function ( patch ) {
    for ( var key in patch ) {
        this.write( key, patch[key].value, patch[key].version );
    }
};

/**
 * ##read
 * Reads the specified key and returns the value and version.
 * Or an empty object, if there is no entry with the specified key.
 *
 * @param {string} key - the key to read
 * @return {object} 
 */
Storage.prototype.read = function ( key ) {
    if ( this.store[key] ) {
        if ( this.store[key].readable ) {
            throw new Error( 'read called without acquiring the needed locks' );
        }

        return {
            value: this.store[key].value,
            version: this.store[key].version
        };
    } else {
        return {};
    }
};

/**
 * ##multiRead
 * This function reads every key in the array and
 * returns a `patch` as defined above.
 *
 * @param {string[]} keys - array of keys to read
 * @return {object} 
 */
Storage.prototype.multiRead = function ( keys ) {
    var res = {};

    for ( var i = 0; i < keys.length; i++ ) {
        var key = keys[i];
        res[key] = this.read( key );
    }
    return res;
};

/**
 * ##lockWrite
 * sets a flag for the key to not be written
 *
 * @param {string} key - the key to lock
 */
Storage.prototype.lockWrite = function ( key ) {
    if ( this.store[key] ) {
        if ( !this.store[key].writable ) {
            throw new Error( 'write lock is not available' );
        }
        this.store[key].writable = false;
    } else {
        this.store[key] = {
            writable: false,
            readable: true,
            value: null,
            version: -1
        };
        this.process.emit( 'newKey', {
            key: key,
            value: null,
            version: -1,
            timestamp: Date.now()
        } );
    }
};

/**
 * ##unlockWrite
 * sets a flag for the key to allow it to be written
 *
 * @param {string} key - the key to unlock
 */
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
        this.process.emit( 'newKey', {
            key: key,
            value: null,
            version: -1,
            timestamp: Date.now()
        } );
    }
};

/**
 * ##lockRead
 * Sets a flag for the key to not be read.
 *
 * @param {string} key - the key to lock
 */
Storage.prototype.lockRead = function ( key ) {
    if ( this.store[key] ) {
        if ( !this.store[key].readable ) {
            throw new Error( 'read lock is not available' );
        }
        this.store[key].readable = false;
    } else {
        this.store[key] = {
            readable: false,
            writable: true,
            value: null,
            version: -1
        };
        this.process.emit( 'newKey', {
            key: key,
            value: null,
            version: -1,
            timestamp: Date.now()
        } );
    }
};

/**
 * ##unlockRead
 * Sets a flag for the key to allow it to be read.
 *
 * @param {string} key - the key to unlock
 */
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
        this.process.emit( 'newKey', {
            key: key,
            value: null,
            version: -1,
            timestamp: Date.now()
        } );
    }
};

/**
 * ##canWrite
 * returns the writable flag for this key
 *
 * @param {string} key - the key to check
 * @return {boolean}
 */
Storage.prototype.canWrite = function ( key ) {
    if ( this.store[key] ) {
        return this.store[key].writable && this.store[key].readable;
    } else {
        return true;
    }
};

/**
 * ##canRead
 * returns the readable flag for this key
 *
 * @param {string} key - the key to check
 * @return {boolean}
 */
Storage.prototype.canRead = function ( key ) {
    if ( this.store[key] ) {
        return this.store[key].readable && this.store[key].writable;
    } else {
        return true;
    }
};

/**
 * ##anyOneLocked
 * returns a flag whether any key has a read or write lock
 *
 * @return {boolean}
 */
Storage.prototype.anyOneLocked = function () {
    for ( var key in this.store ) {
        if ( !( this.store[key].readable && this.store[key].writable )) {
            return true;
        }
    }
    return false;
};

/**
 * ##allLocked
 * returns a flag whether every key has a read and write lock
 *
 * @return {boolean}
 */
Storage.prototype.allLocked = function () {
    for ( var key in this.store ) {
        if ( this.store[key].readable || this.store[key].writable ) {
            return false;
        }
    }
    return true;
};

/**
 * ##lockAll
 * locks read and write for the complete store
 */
Storage.prototype.lockAll = function () {
    for ( var key in this.store ) {
        this.lockRead( key );
        this.lockWrite( key );
    }
};

/**
 * ##unlockAll
 * unlocks read and write for the complete store
 */
Storage.prototype.unlockAll = function () {
    for ( var key in this.store ) {
        this.store[key].writable = true;
        this.store[key].readable = true;
    }
};

/**
 * ##getVersion
 * Return the keys version or -1 if key is not used.
 *
 * @param {string} key - the key to check
 * @return {number} The version number
 */
Storage.prototype.getVersion = function ( key ) {
    if ( this.store[key] ) {
        return this.store[key].version;
    } else {
        return -1;
    }
};

/**
 * ##getKeyVersions
 * returns an object, containing all keys with their corresponding version
 *
 * @return {object}
 */
Storage.prototype.getKeyVersions = function () {
    var result = {};
    for ( var key in this.store ) {
        result[key] = {
            version: this.store[key].version
        };
    }
    return result;
};

/**
 * ##getAll
 * currently just a convenience function for testing
 *
 * @return {object} The complete store
 */
Storage.prototype.getAll = function () {
    return this.store;
};

module.exports = Storage;
