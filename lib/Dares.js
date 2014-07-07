/**
 *
 * Dares.js
 * ========
 *
 * © 2014, TNG Technology Consulting GmbH  
 * Licensed under the Apache License, Version 2.0
 *
 * This file exposes the public API for Dares.
 *
 */

'use strict';

// We require the [process.js](./Dares/process.js.html) file.
var Process = require( './Dares/process.js' );
// And the [defaults.js](./Dares/defaults.js.html) file.
var defaultOptions = require( './Dares/defaults.js' );
// As well as the defaults method from [lodash](http://www.lodash.com/).
var defaults = require( 'lodash.defaults' );

/**
 * #Dares
 * to create a new instance for a distributed system, just call  
 *  `var newNode = new Dares( name, id, port )`  
 * with parameters as follows:
 *
 * @param {number} id - an integer id which has to be unique in the system - no auto-id system, sorry :(
 * @param {number} port - port on which this node shall listen
 * @param {object} options - an object setting the options for Dares. See the defaults.js file for possible options.
 */
var Dares = function ( id, port, options ) {
    defaults( options || {}, defaultOptions );

    Object.defineProperties( options, {
        id: {
            value: id,
            writable: false
        },
        port: {
            value: port,
            writable: false
        }
    } );

    this.options = options;

    var localProcess; 
    var thatCoordinator;


    /**
     * ##start
     * starts the instance, e.g. registers it to the distributed system
     *
     * @param {function} callback - function to be called when the setup is complete.
     *  Will be called with 'null, value' for a successful registration and `error` for a failed attempt.
     */
    this.start = function ( callback ) {
        callback = callback || function () {};

        localProcess = new Process( this, callback );
        thatCoordinator = localProcess.dataReplicationCoordinator;
    };

    /**
     * ##stop
     * When called, no new connections are accepted on the listening port, 
     * thus deleting this instance from the system.
     *
     * @param {function} callback - function which gets called when the shutdown is completed. 
     */
    this.stop = function ( callback ) {
        localProcess.stop( callback );
    };

    /**
     * ##write
     * writes the key, value pair to the distributed system.
     * callback is called with callback( null, {key, value, quorum} ) when the write 
     * was successful and callback( error ) in case of an unsuccessful write
     *
     * @param {string} key - valid json-key to write to
     * @param {any} value - value to write for this key
     * @param {function} callback - function which gets called when the write is completed.
     * @return {Dares} The current Dares instance
     */
    this.write = function ( key, value, callback ) {
        thatCoordinator.write( key, value, callback );
        return this;
    };

    /**
     * ##read
     * reads the value for the input parameter key from the distributed system.
     * callback is called with callback( null, {key, value, quorum} ) when the read 
     * was successful and callback( error ) in case of an unsuccessful read
     *
     * @param {string} key - valid json-key to read
     * @param {function} callback - function which gets called when the read is completed. 
     * @return {Dares} The current Dares instance
     */
    this.read = function ( key, callback ) {
        thatCoordinator.read( key, callback );
        return this;
    };

    /**
     * ##getStoredValue
     * reads the stored data for the key from the local store. Read complete is called
     * with callback( null, {key, value} ).
     * This value is in general __not__ the most recently stored value.
     *
     * @param {string} key - valid json-key to read
     * @param {function} callback - function which gets called when the data is retrieved
     * @return {Dares} The current Dares instance
     */
    this.getStoredValue = function ( key, callback ) {
        var stored = localProcess.storage.store[key];
        var returnObj = {
            key: key,
            value: stored ? stored.value : null
        };
        callback( null, returnObj );
        return this;
    };

    /**
     * ##onChange
     * Listens to the event which gets fired when a key is updated.
     *
     * @param {function} listener - listener to be called when stored keys got changed
     * @return {Dares} The current Dares instance
     */
    this.onChange = function ( listener ) {
        localProcess.on( 'change', listener );
        return this;
    };

    /**
     * ##offChange
     * Unbinds the listener for changed keys.
     * If no listener is passed, all listeners are removed.
     *
     * @param {function} [listener] - The listener which should be removed
     * @return {Dares} The current Dares instance
     */
    this.offChange = function ( listener ) {
        if ( listener !== undefined ) {
            localProcess.removeListener( 'change', listener );
        } else {
            localProcess.removeAllListeners( 'change' );
        }
        return this;
    };

    /**
     * ##onNewKey
     * Listens to the event which gets fired when a new key enters the system
     *
     * @param {function} listener - listener to be called when some new key is registered in the local store
     * @return {Dares} The current Dares instance
     */
    this.onNewKey = function ( listener ) {
        localProcess.on( 'newKey', listener );
        return this;
    };

    /**
     * ##offNewKey
     * Unbinds the listener for new keys.
     * If no listener is passed, all listeners are removed.
     *
     * @param {function} [listener] - The listener which should be removed
     * @return {Dares} The current Dares instance
     */
    this.offNewKey = function ( listener ) {
        if ( listener !== undefined ) {
            localProcess.removeListener( 'newKey', listener );
        } else {
            localProcess.removeAllListeners( 'newKey' );
        }
        return this;
    };
};
module.exports = Dares;
