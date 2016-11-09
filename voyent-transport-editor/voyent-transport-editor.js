Polymer({
	is: "voyent-transport-editor",

    properties: {
        /**
         * Enable debug mode where the underlying JSON data structure will be displayed on the page for review
         */
        debug: { type: Boolean, value: false, reflectToAttribute: true, notify: true },
        /**
         * Passthrough to disable syntax validation in the payload code editor
         */
        disablevalidation: { type: Boolean, value: false },        
        /**
         * Show the simple/clean/basic view of this component
         * The simple view contains a name (subject), body (details), and everything else is preset
         * There is also no ability to choose or override specific transports
         * And a list of preset message elements (basically backpack variables) are defined and can be added to the body (details)
         * @default false
         */
        simple: { type: Boolean, value: false, reflectToAttribute: true, notify: true },
        /**
         * Backing for the message elements list
         * Used with simple view only (simple=true)
         */
        clickedList: { type: String, notify: true, observer: '_clickedListChanged' },
        /**
         * List of message elements (such as {{user_name}}) that can be clicked to append to our text area
         * Used with simple view only (simple=true)
         */
        messageElements: { type: Array, value: [], notify: true },
        /**
         * Flag to show the message elements list on the right of the "simple" view
         * Used with simple view only (simple=true)
         * @default true
         */
        showMessageElements: { type: Boolean, value: true, reflectToAttribute: true, notify: true },
        /**
         * The current value of the transport editor. Data binding is enabled for this attribute.
         * This will link to the underlying notification JSON structure
         */
        value: { type: String,  observer: '_valueChanged', reflectToAttribute: true, notify: true },
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
        defaultSMS: { type: Boolean, value: true, reflectToAttribute: true, notify: true },
        /**
         * The value of the Email transport checkbox
         * This will be overridden if allowEmail=false
         */        
        defaultEmail: { type: Boolean, value: true, reflectToAttribute: true, notify: true }
    },
    observers: [
        '_toolChanged(_tool.transport.browser, _tool.transport.cloud, _tool.transport.sms, _tool.transport.email,' +
                      '_tool.subject.specbrowser, _tool.subject.speccloud, _tool.subject.specsms, _tool.subject.specemail, _tool.subject.global, _tool.subject.browser, _tool.subject.cloud, _tool.subject.sms, _tool.subject.email,' +
                      '_tool.details.specbrowser, _tool.details.speccloud, _tool.details.specsms, _tool.details.specemail, _tool.details.global, _tool.details.browser, _tool.details.cloud, _tool.details.sms, _tool.details.email,' +
                      '_tool.url.specbrowser, _tool.url.speccloud, _tool.url.specsms, _tool.url.specemail, _tool.url.global, _tool.url.browser, _tool.url.cloud, _tool.url.sms, _tool.url.email,' +
                      '_tool.priority.specbrowser, _tool.priority.speccloud, _tool.priority.specsms, _tool.priority.specemail, _tool.priority.global, _tool.priority.browser, _tool.priority.cloud, _tool.priority.sms, _tool.priority.email,' +
                      '_tool.emailtemplate.email,' +
                      '_tool.expire_time.global, _tool.icon.global, _tool.payload)'
    ],
    
    /**
     * Define our initial tool data structure for backing our UI controls
     */
	ready: function() {
	    this.triggeredFromTool = false;
	    
	    this._hasEmailTemplates = false;
	    this._emailTemplates = this._loadEmailTemplates();
	    this.messageElements = this._setDefaultMessageElements();
	    
	    // Log if we don't have any transports available
	    this.noTransports = false;
	    if (!this.allowBrowser && !this.allowCloud && !this.allowSMS && !this.allowEmail) {
	        this.fire('message-error', "No transports were enabled or allowed for this component");
			console.error('No transports were enabled or allowed for this component');
	        this.noTransports = true;
	    }
	    
	    // If we don't have a valid tool state (such as nothing being passed via 'value') we default
	    if (!this._isDefined(this._tool)) {
	        this._setDefaultTool();
	    }
	},
	
	/**
	 * Computed binding to calculate if the width of the "simple" view table should be full or not
	 * This will account for the message elements being shown or not
	 */
	calculateSimpleWidth: function() {
	    return this.showMessageElements ? "70%" : "100%";
	},

	/**
	 * Reset the state of our subject and details
	 * Used with simple view only (simple=true)
	 */
	resetSimple: function() {
	    this.set("_tool.subject.global", "");
	    this.set("_tool.details.global", "");
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
	    // Also restore to default if we're blanked out or undefined
	    if (!this._isDefined(this._tool.payload) || JSON.stringify(this._tool.payload).trim().length === 0) {
	        this._tool.payload = {};
	    }
	    
	    // First add our global JSON (required fields here)
	    toReturn.global = {
	        "details": this._tool.details.global,
	        "payload": this._tool.payload
	    };
	    
	    // Also any any non-required fields
	    this._getGlobalData(toReturn, "subject");
	    this._getGlobalData(toReturn, "url");
	    this._getGlobalData(toReturn, "icon");
	    this._getGlobalData(toReturn, "priority");
	    this._getGlobalData(toReturn, "expire_time");
	    
	    // Then add any transport specific override data
	    // Only necessary if we're not in simple view
	    if (!this.simple) {
            if (this.allowBrowser && this._tool.transport.browser) {
                toReturn.browser = this._getOverrideData("browser");
            }
            if (this.allowCloud && this._tool.transport.cloud) {
                toReturn.cloud = this._getOverrideData("cloud");
            }
            if (this.allowEmail && this._tool.transport.email) {
                toReturn.email = this._getOverrideData("email");
                
                if (this._hasField("emailtemplate", "email")) {
                    toReturn.email.emailtemplate = this._getField("emailtemplate", "email");
                }
            }
            if (this.allowSMS && this._tool.transport.sms) {
                toReturn.sms = this._getOverrideData("sms");
            }
            
            // Finally stringify the result so the service level can use it properly
            // We only stringify for non-simple requests, to be able to fit into action editor and other tools
            try{
                toReturn = JSON.stringify(toReturn, null, 4);
            }catch(error) {
                this.fire('message-error', "Failed to parse transport editor UI tooling to JSON string: " + error);
                console.error('Failed to parse transport editor UI tooling to JSON string:', error);
            }
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
	    
	    // Update our global fields if possible
	    if (this._isDefined(json['global'])) {
	        // Set our generic fields and then our individual fields
	        this._setTransportFromJSON(json, 'global');
	        this._setFieldFromJSON(json, 'global', 'expire_time');
	        this._setFieldFromJSON(json, 'global', 'icon');
	        
	        // Also update the payload accordingly
	        if (this._isDefined(json['global']['payload'])) {
	            this.set('_tool.payload', json['global']['payload']);
	        }
	    }
	    
	    // Set our email template
	    if (this._isDefined(json['email'])) {
	        this._setFieldFromJSON(json, 'email', 'emailtemplate');
	    }
	    
	    // Check our incoming data for each transport type
	    this._setTransportFromJSON(json, 'browser');
	    this._setTransportFromJSON(json, 'cloud');
	    this._setTransportFromJSON(json, 'sms');
	    this._setTransportFromJSON(json, 'email');
	},
	
	/**
	 * Function to set a transport chunk into our UI tooling, such as Browser
	 * This will check if the desired transport is available in our passed JSON,
	 *  and if so will toggle our checkbox and try to populate:
	 *  subject, details, url, priority
	 * @param json
	 * @param transport
	 */
	_setTransportFromJSON: function(json, transport) {
	    if (this._isDefined(json[transport])) {
	        if ('global' !== transport) {
	            this.set('_tool.transport.' + transport, true);
	        }
	        this._setFieldFromJSON(json, transport, 'subject');
	        this._setFieldFromJSON(json, transport, 'details');
	        this._setFieldFromJSON(json, transport, 'url');
	        this._setFieldFromJSON(json, transport, 'priority');
	    }
	},
	
	/**
	 * Function to set an individual field (such as Subject for Browser) in our UI tooling
	 * @param json to set from
	 * @param transport
	 * @param path
	 */
	_setFieldFromJSON: function(json, transport, path) {
	    if (this._isDefined(json[transport][path])) {
	        this.set('_tool.' + path + '.' + transport, json[transport][path]);
	        this.set('_tool.' + path + '.spec' + transport, true);
	    }
	},
	
	/**
	 * Check if the passed value is defined and not null
	 * @param value
	 * @return {boolean}
	 */
	_isDefined: function(value) {
	    return typeof value !== 'undefined' && value !== null;
	},
	
	/**
	 * Function to safely set a valid field from our tooling to our notification JSON data
	 * @param data
	 * @param field
	 */
	_getGlobalData: function(data, field) {
	    if (this._isDefined(this._tool[field].global) && this._tool[field].global !== "") {
	        data.global[field] = this._tool[field].global;
	    }
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
	 * Basically look at the "specTransport" flag and return data for either "global" or "transport"
	 * @param field such as "details" or "url"
	 * @param transport such as "browser" or "cloud"
	 */
	_getField: function(field, transport) {
	    return this._tool[field]['spec' + transport] ? this._tool[field][transport] : null;
	},
	
	/**
	 * Function to determine if we have a valid (defined, not null) value for the desired field/transport combo
	 * @param field such as "details" or "url"
	 * @param transport such as "browser" or "cloud"
	 * @return true/false
	 */
	_hasField: function(field, transport) {
	    var toCheck = this._getField(field, transport);
	    
	    return this._isDefined(toCheck) && toCheck != "";
	},
	
	/**
	 * Function called when the main value for this component changes
	 */
    _valueChanged: function() {
        // If we're triggered from a tool change we just ignore
        // The only time we want to do anything with our new data is if it's set from a non-tool change
        // Such as an initial load from an attribute specified on the page
        if (!this.triggeredFromTool) {
            // We also need to try to parse to a JSON object if we can
            try{
                this.convertJSONToUI(JSON.parse(this.value));
            }catch (error) {
                this.convertJSONToUI(this.value);
            }
        }
        this.triggeredFromTool = false;
    },
    
    /**
     * Function called when the message elements list is clicked and the value changes
     * Used with simple view only (simple=true)
     */
	_clickedListChanged: function() {
	    var area = document.getElementById("messageDetails");
	    if (area && this.clickedList) {
	        // Append our clicked item and focus the text area
	        area.value += this.clickedList;
	        area.focus();
	        
	        // Reset the selection of our list so we can re-select the same element as needed
	        var mElem = document.querySelector("#messageElements");
	        if (mElem) {
	            mElem.select(null);
	        }
	    }
	},
    
    /**
     * Function called when the underlying UI tooling changes for this component
     */
    _toolChanged: function() {
        this.triggeredFromTool = true;
        this.set('value', this.convertUIToJSON());
    },
    
    _valueStringify: function(toConvert) {
        return JSON.stringify(toConvert, null, 4);
    },
    
    /**
     * Retrieve a list of saved email templates IDs from the doc service
     */
	_loadEmailTemplates: function() {
        if (!voyent.io.auth.isLoggedIn()) {
            return;
        }
	    
        var _this = this;
        voyent.io.docs.getDocument({'id': 'emailTemplates'}).then(function(doc) {
            _this.set('_emailTemplates', doc.ids);
            
            if (typeof _this._emailTemplates !== 'undefined' && _this._emailTemplates !== null && _this._emailTemplates.length > 0) {
                _this.set('_hasEmailTemplates', true);
            }
        });
	},
	
	/**
	 * Set a preset list of message elements
	 * Used with simple view only (simple=true)
	 */
	_setDefaultMessageElements: function() {
	    return [ "[Bearing]",
	             "[Direction]",
	             "[Distance]",
	             "[Incident Type]",
	             "[Speed]",
	             "[User Name]"
	           ];
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
                "specbrowser": false,
                "speccloud": false,
                "specsms": false,
                "specemail": false,
                "global": null,
                "browser": null,
                "cloud": null,
                "sms": null,
                "email": null
            },
            "details": {
                "specbrowser": false,
                "speccloud": false,
                "specsms": false,
                "specemail": false,
                "global": "",
                "browser": null,
                "cloud": null,
                "sms": null,
                "email": null
            },
            "url": {
                "specbrowser": false,
                "speccloud": false,
                "specsms": false,
                "specemail": false,
                "global": null,
                "browser": null,
                "cloud": null,
                "sms": null,
                "email": null
            },
            "priority": {
                "specbrowser": false,
                "speccloud": false,
                "specsms": false,
                "specemail": false,
                "global": "info",
                "browser": null,
                "cloud": null,
                "sms": null,
                "email": null
            },
            "emailtemplate": {
                "specemail": true,
                "email": ""
            },
            "expire_time": {
                "global": 4320,
            },
            "icon": {
                "global": null,
            },
            "payload": {}
        });
    }
});