Polymer({
	is: "bridgeit-transport-editor",

    properties: {
        /**
         * Enable debug mode where the underlying JSON data structure will be displayed on the page for review
         */
        debug: { type: Boolean, value: false, reflectToAttribute: true, notify: true },
        /**
         * The current value of the transport editor. Data binding is enabled for this attribute.
         * This will link to the underlying notification JSON structure
         */
        value: { type: Object,  observer: '_valueChanged', reflectToAttribute: true, notify: true },
        /**
         * Underlying UI tool control state
         */
        _tool: { type: Object, observer: '_toolChanged', notify: true },
        /**
         * Allow the Browser transport to be used
         * If this (or any "allow" flag is false) the user won't be able to interact with that transport
         *  on the UI page level, as we will not show any related control elements
         */
        allowBrowser: { type: Boolean, value: true, reflectToAttribute: true, notify: true },
        /**
         * Allow the Cloud transport to be used
         */
        allowCloud: { type: Boolean, value: true, reflectToAttribute: true, notify: true },
        /**
         * Allow the SMS transport to be used
         */
        allowSMS: { type: Boolean, value: true, reflectToAttribute: true, notify: true },
        /**
         * Allow the Email transport to be used
         */
        allowEmail: { type: Boolean, value: true, reflectToAttribute: true, notify: true },
        /**
         * The value of the Browser transport checkbox
         * This will be overridden if allowBrowser=false
         */
        defaultBrowser: { type: Boolean, value: true, reflectToAttribute: true, notify: true },
        /**
         * The value of the Cloud transport checkbox
         * This will be overridden if allowCloud=false
         */        
        defaultCloud: { type: Boolean, value: true, reflectToAttribute: true, notify: true },
        /**
         * The value of the SMS transport checkbox
         * This will be overridden if allowSMS=false
         */        
        defaultSMS: { type: Boolean, value: false, reflectToAttribute: true, notify: true },
        /**
         * The value of the Email transport checkbox
         * This will be overridden if allowEmail=false
         */        
        defaultEmail: { type: Boolean, value: false, reflectToAttribute: true, notify: true }
    },
    observers: [
        '_toolChanged(_tool.transport.browser, _tool.transport.cloud, _tool.transport.sms, _tool.transport.email,' +
                      '_tool.subject.usebrowser, _tool.subject.usecloud, _tool.subject.usesms, _tool.subject.useemail, _tool.subject.global, _tool.subject.browser, _tool.subject.cloud, _tool.subject.sms, _tool.subject.email,' +
                      '_tool.details.usebrowser, _tool.details.usecloud, _tool.details.usesms, _tool.details.useemail, _tool.details.global, _tool.details.browser, _tool.details.cloud, _tool.details.sms, _tool.details.email,' +
                      '_tool.url.usebrowser, _tool.url.usecloud, _tool.url.usesms, _tool.url.useemail, _tool.url.global, _tool.url.browser, _tool.url.cloud, _tool.url.sms, _tool.url.email,' +
                      '_tool.priority.usebrowser, _tool.priority.usecloud, _tool.priority.usesms, _tool.priority.useemail, _tool.priority.global, _tool.priority.browser, _tool.priority.cloud, _tool.priority.sms, _tool.priority.email,' +
                      '_tool.expiryTime.global, _tool.payload)'
    ],
    
    /**
     * Define our initial tool data structure for backing our UI controls
     */
	ready: function() {
	    this.triggeredFromTool = false;
	    
	    // Log if we don't have any transports available
	    this.noTransports = false;
	    if (!this.allowBrowser && !this.allowCloud && !this.allowSMS && !this.allowEmail) {
	        console.error("No transports were enabled or allowed for this component");
	        this.noTransports = true;
	    }
	    
	    // If we don't have a valid tool state (such as nothing being passed via 'value') we default
	    if (typeof this._tool === 'undefined' || this._tool === null) {
	        this._setDefaultTool();
	    }
	},
	
	/**
	 * Convert our UI controls into JSON data format usable by actionable notifications
	 * Basically we want to take all the user choices (like which checkboxes they have) and figure out the
	 *  proper way to store this in a message template
	 * This is the main call into this component, as the fields themselves don't need to be interacted with
	 */
	convertUIToJSON: function() {
	    var toReturn = {};
	    
	    // Payload may be in the process of updating, so ignore any errors for now
	    this.validPayload = {};
	    try{
	        validPayload = JSON.parse(this._tool.payload);
	    }catch(ignored) { }
	    
	    // First add our global JSON
	    toReturn.global = {
	        "subject": this._tool.subject.global,
	        "details": this._tool.details.global,
	        "url": this._tool.url.global,
	        "priority": this._tool.priority.global,
	        "expire_time": this._tool.expiryTime.global,
	        "sent_time": new Date(),
	        "payload": validPayload
	    };
	    
	    if (this.allowBrowser && this._tool.transport.browser) {
	        toReturn.browser = this._getOverrideData("browser");
	    }
	    if (this.allowCloud && this._tool.transport.cloud) {
	        toReturn.cloud = this._getOverrideData("cloud");
	    }
	    if (this.allowEmail && this._tool.transport.email) {
	        toReturn.email = this._getOverrideData("email");
	    }
	    if (this.allowSMS && this._tool.transport.sms) {
	        toReturn.sms = this._getOverrideData("sms");
	    }
	    
	    return toReturn;
	},
	
	/**
	 * Convert passed JSON notification data to a valid UI control state
	 * @param json
	 */
	convertJSONToUI: function(json) {
	    // First clear the state of our tool, or populate defaults as necessary
	    this._setDefaultTool();
	    
	    // TODO Next try to convert the incoming JSON to valid UI tool state
	},
	
	/**
	 * Function to generate override data JSON for the passed transport
	 * This will pull data from our internal UI controls and populate (if available):
	 *  subject, details, url, priority
	 * @param transport
	 */
	_getOverrideData: function(transport) {
	    var toReturn = { };
	    
	    if (this._hasField("subject", transport)) {
	        toReturn.subject = this._getField("subject", transport);
	    }
	    if (this._hasField("details", transport)) {
	        toReturn.details = this._getField("details", transport);
	    }
	    if (this._hasField("url", transport)) {
	        toReturn.url = this._getField("url", transport);
	    }
	    if (this._hasField("priority", transport)) {
	        toReturn.priority = this._getField("priority", transport);
	    }
	    
	    return toReturn;
	},
	
	/**
	 * Function to return the value of a single field from our UI controls
	 * This will determine if the user requested we use the generic global value or a specific override value
	 * Basically look at the "useTransport" flag and return data for either "global" or "transport"
	 * @param field such as "details" or "url"
	 * @param transport such as "browser" or "cloud"
	 */
	_getField: function(field, transport) {
	    return this._tool[field]['use' + transport] ? null : this._tool[field][transport];
	},
	
	/**
	 * Function to determine if we have a valid (defined, not null) value for the desired field/transport combo
	 * @param field such as "details" or "url"
	 * @param transport such as "browser" or "cloud"
	 * @return true/false
	 */
	_hasField: function(field, transport) {
	    var toCheck = this._getField(field, transport);
	    
	    return typeof toCheck !== 'undefined' && toCheck !== null && toCheck != "";
	},
	
	/**
	 * Function called when the main value for this component changes
	 */
    _valueChanged: function() {
        // If we're triggered from a tool change we just ignore
        // The only time we want to do anything with our new data is if it's set from a non-tool change
        // Such as an initial load from an attribute specified on the page
        var setDebugData = this.value;
        if (!this.triggeredFromTool) {
            this.convertJSONToUI(this.value);
        }
        else {
            setDebugData = this.convertUIToJSON();
        }
        this.triggeredFromTool = false;
        
        // Update our debug panel if visible
        if (this.debug) {
            this.set('debugJSON', JSON.stringify(setDebugData, null, 4));
        }
    },
    
    /**
     * Function called when the underlying UI tooling changes for this component
     */
    _toolChanged: function() {
        this.triggeredFromTool = true;
        this.set('value', this.convertUIToJSON());
    },
    
    /**
     * Set the default state of the UI tooling controls
     */
    _setDefaultTool: function() {
        this.set('_tool', {
            "transport": {
                "browser": this.allowBrowser ? this.defaultBrowser : false,
                "cloud": this.allowCloud ? this.defaultCloud : false,
                "sms": this.allowSMS ? this.defaultSMS : false,
                "email": this.allowEmail ? this.defaultEmail : false
            },
            "subject": {
                "usebrowser": true,
                "usecloud": true,
                "usesms": true,
                "useemail": true,
                "global": null,
                "browser": null,
                "cloud": null,
                "sms": null,
                "email": null
            },
            "details": {
                "usebrowser": true,
                "usecloud": true,
                "usesms": true,
                "useemail": true,
                "global": null,
                "browser": null,
                "cloud": null,
                "sms": null,
                "email": null
            },
            "url": {
                "usebrowser": true,
                "usecloud": true,
                "usesms": true,
                "useemail": true,
                "global": null,
                "browser": null,
                "cloud": null,
                "sms": null,
                "email": null
            },
            "expiryTime": {
                "global": 4320,
            },
            "priority": {
                "usebrowser": true,
                "usecloud": true,
                "usesms": true,
                "useemail": true,
                "global": "info",
                "browser": null,
                "cloud": null,
                "sms": null,
                "email": null
            },
            "payload": "{}"
        });
    }
});