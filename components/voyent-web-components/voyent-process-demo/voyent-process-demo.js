Polymer({
	is: "voyent-process-demo",

    properties: {
        loggedIn: { type: Boolean, value: false, notify: true },
        /**
         * Defines the Voyent account of the realm.
         */
        account: { type: String },
        /**
         * Defines the Voyent realm to build actions for.
         */
        realm: { type: String },
        /**
         * Defines the Voyent host to use for services
         */
        host: { type: String, value: "dev.voyent.cloud" },
        /**
         * Push group to attach and join automatically on valid initialization
         * The intent is to listen to the group the process is pushing status updates to
         */
        pushGroup: { type: String, value: "processDemoGroup" },
        /**
         * Process model to execute in the Process Service
         * Only used if debugHighlight=false
         */
        modelId: { type: String, value: "update-status-model" },
        /**
         * If there is a choosable fork we store the value here
         */
        selectedFork: { type: String },
        /**
         * Set to true to not POST to the Process Service at all, and instead
         *  run a basic setTimeout to simulate moving between steps in the process
         */
        debugHighlight: { type: Boolean, value: false },
        /**
         * Minimum millisecond wait between a simulated step
         * Only used if debugHighlight=true
         */
        minMS: { type: Number, value: 2000 },
        /**
         * Random amount of milliseconds to add to the minimum between a simulated step
         * Only used if debugHighlight=true
         */
        randMS: { type: Number, value: 4000 },
    },
    
    /**
     * Define our initial tool data structure for backing our UI controls
     */
	ready: function() {
	    // Used by the process to send events back
	    this.processId = null;
	    
	    // Disable notifications from displaying, as we just need them for payload
        voyent.notify.config.toast.enabled = false;
        voyent.notify.config.native.enabled = false;
	    
	    this._currentProcess = { "title": "Update Status Model",
	                             "forks": [ "High Road", "Low Road" ],
	                             "model": [ { "name": "Start", "image": "0-start.png" },
                                            { "name": "Update Status A", "image": "1-update-status-a.png" },
                                            { "name": "Update Status B", "image": "2-update-status-b.png" },
                                            { "name": "Synthetic Event A", "image": "3-synthetic-event-a.png", "waitFire": true },
                                            { "name": "Update Status C", "image": "4-update-status-c.png" },
                                            { "name": "Synthetic Event B", "image": "5-synthetic-event-b.png", "waitFire": true },
                                            { "name": "Fork", "image": "6-fork.png" },
                                            { "name": "Outcome", "image": "blank.png", "fork": true, "groupList": [ { "name": "Update Status High Road", "image": "7-update-status-high-road.png" },
                                                                                                                    { "name": "Fork Joiner", "image": "8-fork-joiner.png" },
                                                                                                                    { "name": "Update Status Low Road", "image": "9-update-status-low-road.png" } ] },
                                            { "name": "End", "image": "10-end.png"} ]
                               };
        // Set the default selected fork
        this.selectedFork = this._currentProcess.forks[0];
	},
	
	initialize: function() {
        if (!this.realm) {
            this.realm = voyent.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = voyent.io.auth.getLastKnownAccount();
        }
        if (!voyent.io.auth.isLoggedIn()) {
            this.set('loggedIn', false);
            return;
        }
        
        // If we reached this far we are logged in
        this.set('loggedIn', true);
        
        // Notify the user
        this.fire('message-info', 'Initialized and prepared to start');
        
        if (!this.debugHighlight) {
            // Attach and join the push group
            voyent.xio.push.attach('http://' + this.host + '/pushio/' + this.account + '/realms/' + this.realm, this.pushGroup);
        
            // Handle incoming notifications
            // We don't need to display the notifications, since updating our process model image will show the user enough
            var _this = this;
            document.addEventListener('notificationReceived',function(e) {
                // Clear our old highlights
                _this.clearHighlights();
                    
                var matchIndex = -1;
                
                // Check whether we received a Fork related notification
                if (_this._currentProcess.forks.indexOf(e.detail.notification.details) > -1) {
                    // We need to find the "fork" item in our model, that'll be our matchIndex
                    for (var i = 0; i < _this._currentProcess.model.length; i++) {
                        if (_this._currentProcess.model[i].fork) {
                            matchIndex = i;
                            break;
                        }
                    }
                    
                    // But we also need to manually highlight the related child element
                    if (matchIndex > -1) {
                        var forkItem = _this._currentProcess.model[matchIndex];
                        
                        for (var j = 0; j < forkItem.groupList.length; j++) {
                            if (forkItem.groupList[j].name == (e.detail.notification.subject + ' ' + e.detail.notification.details)) {
                                _this.set('_currentProcess.model.' + i + '.groupList.' + j + '.highlight', true);
                                break;
                            }
                        }
                    }
                }
                // Otherwise loop as normal and look for a match
                else {
                    for (var i = 0; i < _this._currentProcess.model.length; i++) {
                        var current = _this._currentProcess.model[i];
                        
                        if (current.name == (e.detail.notification.subject + ' ' + e.detail.notification.details)) {
                            matchIndex = i;
                            break;
                        }
                    }
                }
                
                // If we have a match we'll want to update the highlight accordingly
                if (matchIndex > -1) {
                    _this.set('_currentProcess.model.' + matchIndex + '.highlight', true);
                    
                    // If the next item has a waitFire we need to manually move to it
                    if ((_this._currentProcess.model[matchIndex+1].waitFire == true) ||
                        (matchIndex >= (_this._currentProcess.model.length-2))) {
                        setTimeout(function() {
                            _this.highlightNext();
                        }, 1500);
                    }
                    // Also if we're at the second-to-last step we need to automatically move to End
                    if (matchIndex >= (_this._currentProcess.model.length-2)) {
                        var prevMS = 3000;
                        setTimeout(function() {
                            _this.highlightNext();
                        }, prevMS);
                        // And then we'll want to move off End to no highlight
                        setTimeout(function() {
                            _this.clearHighlights();
                        }, prevMS+2000);
                    }
                }
            });
        }
	},
	
	startProcess: function() {
	    if (!this.debugHighlight) {
	        // Begin with highlighting the "Start"
	        this.clearHighlights();
	        this.highlightNext();
	        
	        // Then post to start the process, which should end up with us receiving status notifications
	        var _this = this;
	        voyent.$.post('http://' + this.host + '/process/' + this.account + '/realms/' + this.realm + '/processes/' + this.modelId + '?access_token=' + voyent.io.auth.getLastAccessToken()).then(function(response){
	            _this.set('processId', response.processId);
	            _this.fire('message-info', "Executed process '" + response.processName + "'");
	        });
	    }
	    else {
            var _this = this;
            var accumulatedTimeout = 0;
            for (var i = 0; i < this._currentProcess.model.length+1; i++) {
                var timeout = i === 0 ? 300 : (this.minMS + Math.floor((Math.random() * this.randMS) + 1));
                accumulatedTimeout += timeout;
                setTimeout(function() {
                    _this.highlightNext();
                }, accumulatedTimeout);
            }
        }
	},
	
	clearHighlights: function() {
        var currentHighlight = -1;
	    for (var i = 0; i < this._currentProcess.model.length; i++) {
	        var currentItem = this._currentProcess.model[i];
	        if (currentItem.highlight) {
	            currentHighlight = i;
	        }
	        this.set('_currentProcess.model.' + i + '.highlight', false);
	        
	        // Check for any sub-group and clear their highlight too
	        if (currentItem.fork) {
	            for (var j = 0; j < currentItem.groupList.length; j++) {
	                this.set('_currentProcess.model.' + i + '.groupList.' + j + '.highlight', false);
	            }
	        }
	    }
	    return currentHighlight;
	},
	
	highlightNext: function() {
	    var currentHighlight = this.clearHighlights();
	    
	    // Increase our current highlight
	    // This will either move through our array, or start at 0 if we don't have a previous highlight
	    currentHighlight++;
	    if (currentHighlight <= this._currentProcess.model.length) {
	        this.set('_currentProcess.model.' + currentHighlight + '.highlight', true);
	    }
	},
	
	sendEvent: function(e) {
	    e.stopPropagation(); // Prevent double submit in case the image is clicked
	    
	    // Don't send an actual event if we're debugged
	    if (this.debugHighlight) {
	        return;
	    }
	    
	    var model = JSON.parse(e.target.getAttribute('data-model'));
	    // Note the data parameters are case sensitive based on what the Process Service uses
        var event = {
            time: new Date().toISOString(),
            service: 'voyent-process-demo',
            event: model.name,
            type: 'synthetic-message-event-withProcessId',
            processId: this.processId,
            data: {
                'Fork': this.selectedFork,
                'target': 'process'
            }
        };
        
        // Debug infos
        console.log("Going to send event '" + model.name + "' with process ID " + this.processId + " and fork " + this.selectedFork);
        
        var _this = this;
	    voyent.io.event.createCustomEvent({ "event": event }).then(function() {
            _this.fire('message-info', "Successfully sent event '" + model.name + "'"); 
	    }).catch(function(error) {
	        _this.fire('message-error', "Failed to send event '" + model.name + "'");
	    });
	},
});