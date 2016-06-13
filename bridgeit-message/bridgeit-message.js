Polymer({
    is: "bridgeit-message",

    properties: {
        /**
         * Underlying list of error/info messages
         */
        messages: { type: Array, value: [], reflectToAttribute: true, notify: true },
        /**
         * Number of milliseconds before removing the current message from the page
         * If this is less than 0 the messages are never removed, and must be done manually (via removeOldest)
         * @default 2000
         */
        hideafter: { type: Number, value: 2000, reflectToAttribute: true, notify: true },
        /**
         * Enable to display a timestamp prefixing each error/info message
         * @default false
         */
        usetimestamp: { type: Boolean, value: false, reflectToAttribute: true, notify: true },
        /**
         * Enable to also log to the web console (via console.error or console.log)
         * @default true
         */
        useconsole: { type: Boolean, value: true, reflectToAttribute: true, notify: true },
        /**
         * Enable to also display a Javascript alert() for any error/info message
         * @default false
         */
        usealert: { type: Boolean, value: false, reflectToAttribute: true, notify: true }
    },
    
    ready: function() {
        var _this = this;
        
        window.addEventListener('message-error',  function(e) {
            _this._handleMessage(e, 'error'); 
        });
        
        window.addEventListener('message-info',  function(e) {
            _this._handleMessage(e, 'info');
        });
    },
    
    error: function(messageText) {
        this.fire('message-error', messageText);
    },
    
    info: function(messageText) {
        this.fire('message-info', messageText);
    },
    
    removeOldest: function() {
        if (this.messages !== null && this.messages.length > 0) { 
            this.shift('messages');
        }
    },
    
    _handleMessage: function(e, type) {
        // Determine the various message attributes
        var text = e;
        if (e.detail) {
            text = e.detail;
        }
        var timestamp = this._makeTimestamp();
        
        // Update our messages list
        this.push('messages', { 'timestamp': timestamp, 'text': text, 'type': type } );
        
        // Log to the web console if enabled
        if (this.useconsole) {
            if (type === 'error') {
                console.error((this.usetimestamp ? timestamp + "> " : "") + text);
            }
            else {
                console.log((this.usetimestamp ? timestamp + "> " : "") + text);
            }
        }
        
        // Show an alert if enabled
        if (this.usealert) {
            alert((this.usetimestamp ? timestamp + "> " : "") + text + " (" + type + ")");
        }
        
        // Set a timeout to remove the oldest (zero index) message
        if (this.hideafter > 0) {
            var _this = this;
            setTimeout(function() {
                _this.shift('messages');
            }, this.hideafter);
        }
    },
    
    /**
     * Function to make a human readable timestamp of HH:MM:SS APM
     */
    _makeTimestamp: function() {
        var now = new Date();
        var time = [ now.getHours(), now.getMinutes(), now.getSeconds() ];
        
        time[0] = ( time[0] < 12 ) ? time[0] : time[0] - 12;
        time[0] = time[0] || 12;
        
        for (var i = 1; i < 3; i++) {
            if (time[i] < 10) {
                time[i] = "0" + time[i];
            }
        }
        
        return time.join(":") + " " + ((time[0] < 12) ? "AM" : "PM");
    },
});
