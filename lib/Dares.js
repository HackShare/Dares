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
var defaults = require( './Dares/defaults.js' );
// As well as the extend method from the [utility.js](./Dares/utility.js.html) file.
var extend = require( './Dares/utility.js' ).extend;

var Dares;

(function () {
    var localProcess; 
    var thatCoordinator;


    //##how to use
    //to create a new instance for a distributed system, just call  
    // `var newNode = new Dares( name, id, port )`  
    //with parameters as follows:
    //
    // * `id:` an integer id which has to be unique in the system - no auto-id system, sorry :(
    //
    // * `port:` port on which this node shall listen
    //
    // * `options:` an object setting the options for Dares. See the defaults.js file for possible options.
    Dares = function ( id, port, options ) {

        options = extend( defaults, options || {} );

        Object.defineProperties( options, {
            id: {
                value: id,
                writable: false
            },
            port: {
                value: port,
                writable: false
            }
        });

        this.options = options;
    };

    //##start
    //starts the instance, e.g. registers it to the distributed system
    //
    // * `callback:` function to be called when the setup is complete. Will be called with
    // `true` for a successful registration and `false, error` for a failed attempt
    Dares.prototype.start = function ( callback ) {
        callback = callback || function () {};

        localProcess = new Process( this, callback );
        thatCoordinator = localProcess.dataReplicationCoordinator;
    };
    
    //##write
    // input parameters:
    // 
    // * `key:` valid json-key to write to
    // 
    // * `value:` value to write for this key
    // 
    // * `callback:` function which gets called when the write is completed. 
    // 
    // writes the key, value pair to the distributed system.
    // callback is called with callback( true, readProcesses ) when the write 
    // was successful and callback( false, error ) in case of an unsuccessful write
    Dares.prototype.write = function ( key, value, callback ) {
        thatCoordinator.write( key, value, callback );
        return this;
    };

    //##read
    // input parameters:
    // 
    // * `key:` valid json-key to read
    // 
    // * `callback:` function which gets called when the read is completed. 
    // 
    // reads the value for the input parameter key from the distributed system.
    // callback is called with callback( true, value, writtenProcesses ) when the read 
    // was successful and callback( false, error ) in case of an unsuccessful read
    Dares.prototype.read = function ( key, callback ) {
        thatCoordinator.read( key, callback );
        return this;
    };

    //##getStoredValue
    //input parameters:
    //
    // * `key:` valid json-key to read
    // 
    // * `callback:` function which gets called when the data is retrieved
    //
    // reads the stored data for the key from the local store. Read complete is called
    // like the real read with callback( true, value ).
    // This value is in general __not__ the most recently stored value
    Dares.prototype.getStoredValue = function ( key, callback ) {
        callback( true, localProcess.storage.store[key].value );
        return this;
    };

    //##stop
    //when called, no new connections are accepted on the listening port, 
    //thus deleting this instance from the system
    Dares.prototype.stop = function (callback) {
        localProcess.stop(callback);
    };

    //##onChange
    // input parameter:
    // 
    // * `listener:` listener to be called when stored keys got changed
    // 
    //listens to the event which gets fired when a key is updated
    Dares.prototype.onChange = function ( listener ) {
        localProcess.on( 'change', listener );
        return this;
    };

    // ##offChange
    //
    // Unbinds the listener for changed keys.
    // If no listener is passed, all listeners are removed.
    //
    // `listener:` The listener which should be removed
    Dares.prototype.offChange = function ( listener ) {
        if ( listener !== undefined ) {
            localProcess.removeListener( 'change', listener );
        } else {
            localProcess.removeAllListeners( 'change' );
        }
        return this;
    };

    //##onNewKey
    // input parameter:
    // 
    // * `listener:` listener to be called when some new key is registered in the local store
    // 
    //listens to the event which gets fired when a new key enters the system
    Dares.prototype.onNewKey = function ( listener ) {
        localProcess.on( 'newKey', listener );
        return this;
    };

    // ##offNewKey
    //
    // Unbinds the listener for new keys.
    // If no listener is passed, all listeners are removed.
    //
    // `listener:` The listener which should be removed
    Dares.prototype.offNewKey = function ( listener ) {
        if ( listener !== undefined ) {
            localProcess.removeListener( 'newKey', listener );
        } else {
            localProcess.removeAllListeners( 'newKey' );
        }
        return this;
    };
})();

module.exports = Dares;
