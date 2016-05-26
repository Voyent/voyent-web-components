Polymer({
	is: "bridgeit-transport-editor",

    properties: {
        /**
         * Enable debug mode, where the component can be manually submitted and the template JSON viewed
         */
        debug: { type: Boolean, value: false, reflectToAttribute: true, notify: true },
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
        defaultEmail: { type: Boolean, value: false, reflectToAttribute: true, notify: true },
    },
    
    /**
     * Define our initial tool data structure for backing our UI controls
     */
	ready: function() {
	    // Log if we don't have any transports available
	    this.noTransports = false;
	    if (!this.allowBrowser && !this.allowCloud && !this.allowSMS && !this.allowEmail) {
	        console.error("No transports were enabled or allowed for this component");
	        this.noTransports = true;
	    }
	    
        this.tool = {
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
                "usebrowser": true,
                "usecloud": true,
                "usesms": true,
                "useemail": true,
                "global": 4320,
                "browser": null,
                "cloud": null,
                "sms": null,
                "email": null
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
        };
	},
	
	/**
	 * Function to debug our JSON notification template and allow it to be displayed to the user
	 * This will also log the data to the web console
	 */
	debugSubmit: function() {
	    this.set('debugJSON', JSON.stringify(this.getTemplateJSON(), null, 4));
	    console.log(this.debugJSON);
	},
	
	/**
	 * Convert our UI controls into JSON data format usable by actionable notifications
	 * Basically we want to take all the user choices (like which checkboxes they have) and figure out the
	 *  proper way to store this in a message template
	 * This is the main call into this component, as the fields themselves don't need to be interacted with
	 */
	getTemplateJSON: function() {
	    var toReturn = {};
	    
	    // First add our global JSON
	    toReturn.global = {
	        "subject": this.tool.subject.global,
	        "details": this.tool.details.global,
	        "url": this.tool.url.global,
	        "priority": this.tool.priority.global,
	        "expire_time": this.tool.expiryTime.global,
	        "sent_time": new Date(),
	        "payload": JSON.parse(this.tool.payload)
	    };
	    
	    if (this.allowBrowser && this.tool.transport.browser) {
	        toReturn.browser = this._getOverrideData("browser");
	    }
	    if (this.allowCloud && this.tool.transport.cloud) {
	        toReturn.cloud = this._getOverrideData("cloud");
	    }
	    if (this.allowEmail && this.tool.transport.email) {
	        toReturn.email = this._getOverrideData("email");
	    }
	    if (this.allowSMS && this.tool.transport.sms) {
	        toReturn.sms = this._getOverrideData("sms");
	    }
	    
	    return toReturn;
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
	        toReturn.desc = this._getField("details", transport);
	    }
	    if (this._hasField("details", transport)) {
	        toReturn.desc = this._getField("details", transport);
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
	    return this.tool[field]['use' + transport] ? null : this.tool[field][transport];
	},
	
	/**
	 * Function to determine if we have a valid (defined, not null) value for the desired field/transport combo
	 * @param field such as "details" or "url"
	 * @param transport such as "browser" or "cloud"
	 * @return true/false
	 */
	_hasField: function(field, transport) {
	    var toCheck = this._getField(field, transport);
	    //var toCheck = this.tool[field][transport];
	    
	    return typeof toCheck !== 'undefined' && toCheck !== null;
	}
});