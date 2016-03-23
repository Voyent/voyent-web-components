Polymer({
	is: "bridgeit-backpack-log",

    properties: {
        /**
         * Defines the BridgeIt account of the realm.
         * @default bridgeit.io.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * Defines the BridgeIt realm to build actions for.
         * @default bridgeit.io.auth.getLastKnownRealm()
         */
        realm: { type: String },
        /**
         * A query object that can be used to find specific log entries.
         *
         * Example:
         *
         *      //only return error level logs for my.realm
         *      {"realmName":"my.realm",
         *      "level":"error"}
         */
        query: { type: Object, value: {} },
        /**
         * Specify the exclusion of fields to return in the result set.
         *
         * Example:
         *
         *      //exclude transaction code and username columns
         *      {"tx":0,"username":0}
         */
        fields: { type: Object, value: {} },
        /**
         * Additional query options such as limit and sort. Only one sort parameter can be specified in the options (others will be ignored).
         *
         * Example:
         *
         *      //500 log records + sort by time (descending)
         *      {"limit":500,"sort":{"time":-1}}
         */
        options: { type: Object, value: {"sort":{"time":-1}} },
        /**
         * Selected index of the saved action dropdown
         */
        selectedAction: { type: Number, value: 0, notify: true },
        /**
         * Selected index of the time limit dropdown
         */
        selectedLimit: { type: Number, value: 1, notify: true },
    },

    /**
     * Method to prepare our component, namely getting our saved action list
     *  and time limits for the dropdowns
     * We also set some default variables
     */
	ready: function() {
        if (!this.realm) {
            this.realm = bridgeit.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = bridgeit.io.auth.getLastKnownAccount();
        }
        if (bridgeit.io.auth.isLoggedIn()) {
            this.getActions();
        }
        
        this.getTimeLimits();
        this._gotLogs = false;
        this._logSize = 0;
        this._loading = false;
        this._backpack = [];
        this._taskGroups = [];
        this._matchCount = 0;
	},
	
    /**
     * Fetch the list of previously created and saved actions
     */
    getActions: function() {
        var _this = this;
        bridgeit.io.action.findActions({"realm":this.realm}).then(function(actions) {
            _this._savedActions = actions.length > 0 ? actions : null;
        }).catch(function(error) {
            console.log('Error in getActions:',error);
            _this.fire('bridgeit-error', {error: error});
        });
    },
    
    /**
     * Generate a list of time limits for use in a dropdown
     */
    getTimeLimits: function() {
        this._timeLimits = [];
        
        this._pushTimeLimit("1 minute", "minute", 1);
        this._pushTimeLimit("5 minutes", "minute", 5);
        this._pushTimeLimit("10 minutes", "minute", 10);
        this._pushTimeLimit("30 minutes", "minute", 30);
        this._pushTimeLimit("1 hour", "hour", 1);
        this._pushTimeLimit("8 hours", "hour", 8);
        this._pushTimeLimit("24 hours", "day", 1);
        this._pushTimeLimit("48 hours", "day", 2);
        this._pushTimeLimit("72 hours", "day", 3);
        this._pushTimeLimit("5 days", "day", 5);
        this._pushTimeLimit("2 weeks", "day", 14);
        this._pushTimeLimit("1 month", "month", 1);
        this._pushTimeLimit("6 months", "month", 6);
        this._pushTimeLimit("1 year", "year", 1);
        this._pushTimeLimit("All Time", "all");
    },
    
    /**
     * Computed binding function
     * Used for deciding a CSS class based on the passed highlight var
     * Polymer 1.0 doesn't support direct inline string class binding so we have to do this workaround
     * See: http://stackoverflow.com/questions/30607379/polymer-1-0-binding-css-classes
     */
    highlightStyle: function(highlight) {
        return highlight ? 'highlight' : '';
    },
    
    /**
     * Computed binding function
     * Check whether we have a valid log size to display
     */
    hasLogs: function() {
        return this._logSize > 0;
    },
    
    //******************PRIVATE API******************
    /**
     * Function to get our logs and load our actions
     * This will retrieve all logs and then sort them to valuable action related content
     * We will also pull the taskGroup/taskItems for the saved action we selected
     * @private
     */
    _submit: function() {
        // Check selectedAction and selectedLimit for validity.
        if (this.selectedAction === null || this.selectedLimit === null) {
            console.error("Select an action and limit");
            return;
        }
        
        // Reset our state variables before processing the new request
        this._gotLogs = false;
        this._logSize = 0;
        this._loading = false;
        
        // Store our currently selected saved action as a set of task groups
        this._taskGroups = this._savedActions[this.selectedAction].taskGroups;
        
        // Loop through the task groups and items and mark each one not highlighted
        var currentTaskGroup = null;
        for (var i = 0; i < this._taskGroups.length; i++) {
            currentTaskGroup = this._taskGroups[i];
            this.set('_taskGroups.' + i + '.highlight', false);
            
            for (var j = 0; j < currentTaskGroup.tasks.length; j++) {
                this.set('_taskGroups.' + i + '.tasks.' + j + '.highlight', false);
            }
        }
        
        /** TODO NTFY-214 Can't query by date at the moment because the underlying MongoDB requires an ISODate object
        if (this._timeLimits[this.selectedLimit].date !== null) {
            this.query = {"$and":[{"time":{"$gte":{"$date": this._timeLimits[this.selectedLimit].date.toISOString()}}}]};
        }
        else {
            delete this.query.time;
        }
        */
        
        // TODO TEMPORARY Limit to action service
        this.query.service = 'Action';
        
        // Grab our logs
        this._loading = true;
        var _this = this;
        bridgeit.io.admin.getLogs({
            account: this.account,
            query: this.query,
            options: this.options,
            fields: this.fields
        }).then(this._fetchLogsCallback.bind(this)).catch(function(error){
            console.log('fetchLogs (audit) caught an error:', error);
            _this.fire('bridgeit-error', {error: error});
        });
    },
    
    /**
     * Processes the logs returned from the auth service
     * @param logs
     * @private
     */
    _fetchLogsCallback: function(logs) {
        this._backpack.length = 0;
        
        // We're looking for messages of this format:
        //  Task Result: [ managerMessage ][ managerPush ] = {}
        // Any matching messages will be parsed and stored in our backpack list
        var taskResultStr = 'Task Result:';
        var currentMessage = null;
        var toAdd = null;
        for (var i = 0; i < logs.length; i++) {
            if (logs[i].message.indexOf(taskResultStr) !== -1) {
                toAdd = logs[i];
                toAdd.highlight = false;
                toAdd.timeFormat = this._formatTime(toAdd.time);
                
                // We want to strip off "Task Result:"
                currentMessage = toAdd.message.substring(taskResultStr.length).trim();
                
                // We want to store the taskGroup (first [ ITEM ])
                toAdd.taskGroup = currentMessage.substring(currentMessage.indexOf('[')+1, currentMessage.indexOf(']')).trim();
                
                // We want to store the taskItem (second [ ITEM ])
                currentMessage = currentMessage.substring(currentMessage.indexOf(']')+1).trim();
                toAdd.taskItem = currentMessage.substring(currentMessage.indexOf('[')+1, currentMessage.indexOf(']')).trim();
                
                // Once stored we'll strip the entire starter and basically keep everything after the equal (=) sign
                currentMessage = currentMessage.substring(currentMessage.indexOf('=')+1).trim();
                
                // Format the JSON if we can
                toAdd.messageFormat = currentMessage;
                try{
                    toAdd.messageFormat = JSON.stringify(JSON.parse(currentMessage), null, 4);
                }catch (error) { };
                
                // If we have a valid taskGroup check our current action for validity
                // Basically we don't want to pollute the logs with items from other actions
                if (toAdd.taskGroup) {
                    var foundMatch = false;
                    for (var j = 0; j < this._taskGroups.length; j++) {
                        if (this._taskGroups[j].name === toAdd.taskGroup) {
                            foundMatch = true;
                            break;
                        }
                    }
                    
                    // If we didn't find a match reset our object and abandon
                    if (!foundMatch) {
                        toAdd = null;
                    }
                }
                
                // Finally if we still have a valid toAdd object push it to the backpack list
                if (toAdd !== null) {
                    this.push('_backpack', toAdd);
                }
            }
        }
        
        console.log("Backpack size is " + this._backpack.length + " from " + logs.length + " log entries");
        
        // Clear our old full logs, mark that we have retrieved logs, and their size
        logs.length = 0;
        this._gotLogs = true;
        this._logSize = this._backpack.length;
        
        // Done
        this._loading = false;
    },
    
    /**
     * Convenience function to create a proper date object a set amount of time in the past
     * @param name displayed to the user
     * @param interval of minute, hour, day, month, or year
     * @param units to move in the past (positive number)
     * @private
     */
    _pushTimeLimit: function(name, interval, units) {
        // All time means we don't need to limit the date at all
        if (interval === 'all') {
            this.push('_timeLimits', {name: "All Time", date: null });
        }
        // Otherwise figure out a date object a set amount in the past
        else {
            var currentDate = new Date();
            switch(interval.toLowerCase()) {
                case 'minute' : currentDate.setMinutes(currentDate.getMinutes() - units); break;
                case 'hour' : currentDate.setHours(currentDate.getHours() - units); break;
                case 'day' : currentDate.setDate(currentDate.getDate() - units); break;
                case 'month' : currentDate.setMonth(currentDate.getMonth() - units); break;
                case 'year' : currentDate.setFullYear(currentDate.getFullYear() - units); break;
            }
            this.push('_timeLimits', {name: name, date: currentDate });
        }
    },
    
    /**
     * Format time and date for display on the page
     * Desired format is YYYY-MM-DD, HH:MM:SS.MLS
     * @param time
     */
    _formatTime: function(time) {
        var date = new Date(time);
        
        return date.getFullYear() + "-" + ('0'+(date.getMonth()+1)).slice(-2) + "-" + date.getDate() + ", " +
               date.getHours() + ":" + ('0'+date.getMinutes()).slice(-2) + ":" + ('0'+date.getSeconds()).slice(-2) + "." + ('00'+date.getMilliseconds()).slice(-3);
    },
    
    /**
     * Event fired when a task group is clicked
     * We will take the clicked name and check it against our backpack list
     * Any messages that match will be highlighted
     * @param e event
     * @private
     */
    _viewGroup: function(e) {
        var taskName = e.target.getAttribute('data-workflow-item');
        
        var match = false;
        for (var i = 0; i < this._taskGroups.length; i++) {
            // Set our highlight
            match = (taskName === this._taskGroups[i].name);
            this.set('_taskGroups.' + i + '.highlight', match);
            
            // Reset all task items to not highlighted
            for (var j = 0; j < this._taskGroups[i].tasks.length; j++) {
                this.set('_taskGroups.' + i + '.tasks.' + j + '.highlight', false);
            }
        }
        
        this._viewGeneric(taskName, 'taskGroup');
    },
    
    /**
     * Event fired when a task item is clicked
     * We will take the clicked name and check it against our backpack list
     * Any messages that match will be highlighted
     * @param e event
     * @private
     */
    _viewItem: function(e) {
        var parent = JSON.parse(e.target.getAttribute('data-parent-item'));
        var taskName = e.target.getAttribute('data-workflow-item');
        
        var match = false;
        var innerMatch = false;
        for (var i = 0; i < this._taskGroups.length; i++) {
            match = (parent.name === this._taskGroups[i].name);
            innerMatch = false;
            
            for (var j = 0; j < this._taskGroups[i].tasks.length; j++) {
                if (match) {
                    innerMatch = (taskName === this._taskGroups[i].tasks[j].name);
                }
                
                this.set('_taskGroups.' + i + '.tasks.' + j + '.highlight', innerMatch);
            }
            
            // Reset the task group highlight regardless, since we want to highlight a task item
            this.set('_taskGroups.' + i + '.highlight', false);
        }
        
        this._viewGeneric(taskName, 'taskItem');
    },
    
    /**
     * Generic convenience function that handles highlighting matching log messages
     *  from the passed task name
     * @param taskName
     * @param compareTo either 'taskGroup' or 'taskItem'
     * @private
     */
    _viewGeneric: function(taskName, compareTo) {
        // We want to loop through our backpack messages and highlight any in the passed task item
        this._matchCount = 0;
        var match = false;
        for (var i = 0; i < this._backpack.length; i++) {
            match = (taskName === this._backpack[i][compareTo]);
            this.set('_backpack.' + i + '.highlight', match);
            
            if (match) {
                this._matchCount++;
            }
        }
    }
});