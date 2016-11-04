Polymer({
	is: "voyent-backpack-log",

    properties: {
        /**
         * Defines the Voyent account of the realm.
         * @default voyent.io.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * Defines the Voyent realm to build actions for.
         * @default voyent.io.auth.getLastKnownRealm()
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
         * We pull 500 log records + sort by time (newest to oldest)
         */
        options: { type: Object, value: {"limit":500,"sort":{"time":-1}} },
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
            this.realm = voyent.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = voyent.io.auth.getLastKnownAccount();
        }
        
        // Some static variables
        this.getTimeLimits();
        this.miscName = "Uncategorized";
        this.tableWrapId = "tableWrap";
        
        // Some state variables for changing the view
        this._gotLogs = false; // Track whether we made a service call to get logs, even if it returned nothing
        this._loading = false; // Track whether we're currently making a request to the log service
        this._tableView = false; // Track whether we're on the second tier view of the table log entries
        
        this._allLogs = []; // Store the entire set of our parsed and formatted logs
        this._currentAction = null; // Currently selected action for the table view
        this._savedActions = []; // List of saved actions from action service
        this._pastActions = []; // List of past executed action names parsed from logs
        this._taskGroups = []; // Current task groups for our second tier view
        this._backpack = []; // Current backpack content for our third tier view
        this._matchList = []; // Used for scrolling and highlighting items in our second tier view
        this._currentMatchIndex = 0; // Used for tracking our currently scrolled item in our second tier view
        
        // Store our max recommended height for backpack log elements
        // This will be 80% of the view port, up to a maximum of 800px
        var h = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
        var calcH = Math.round(h*0.8);
        if (calcH > 800) {
            calcH = 800;
        }
        this.set('_maxHeight', calcH);
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
     * Get and format the current date
     * Desired format is YYYY-MM-DD, HH:MM
     * @param time
     */
    getCurrentDate: function() {
        var date = new Date();
        
        return date.getFullYear() + "-" + ('0'+(date.getMonth()+1)).slice(-2) + "-" + ('0'+date.getDate()).slice(-2) + ", " +
               date.getHours() + ":" + ('0'+date.getMinutes()).slice(-2);
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
     * Used to figure out if our backpack array has logs
     */
    hasLogs: function() {
        return this._backpack.length > 0;
    },
    
    /**
     * Computed binding function
     * Used to figure out if our past actions array has any content
     */
    hasActions: function(toCheck) {
        return toCheck && toCheck.length > 0;
    },
    
    /**
     * Computed binding function
     * Used to figure out if the passed date exists
     */
    hasDate: function(date) {
        return date && date !== null;
    },
    
    /**
     * Computed binding function
     * Returns the size of our matchList
     */
    matchCount: function() {
        return this._matchList.length;
    },
    
    /**
     * Computed binding function
     * Determine if we have any match list entries
     */
    hasMatches: function() {
        return this._matchList.length > 0;
    },
    
    /**
     * Determine if the passed task group is a conditional task group
     * Only return true if that task group also has some elseTasks
     * @param group
     * @return {boolean}
     */
    isConditionalTaskGroup: function(group) {
        return (group.type === 'conditional-taskgroup' && group.elseTasks !== null && typeof group.elseTasks !== 'undefined' && group.elseTasks.length > 0);
    },
    
    /**
     * Computed binding function
     * Return a valid string format for our action/taskGroup/taskItem container
     * If we don't have a valid action we will return null, otherwise we'll try to
     *  populate any data we have, separated by dashes
     */
    formatContainer: function(backpack) {
        if (backpack.action === null) {
            return this._currentAction.name === this.miscName ? null : this.miscName;
        }
        
        var toReturn = backpack.action;
        if (backpack.taskGroup !== null) {
            toReturn += ' - ' + backpack.taskGroup;
        }
        if (backpack.taskItem !== null) {
            toReturn += ' - ' + backpack.taskItem;
        }
        return toReturn + ': ';
    },
    
    //******************PRIVATE API******************
    /**
     * Function to get our logs and load our actions
     * This will retrieve all logs and then sort them to valuable action related content
     * We will also pull the taskGroup/taskItems for the saved action we selected
     * @private
     */
    _getLogs: function() {
        // Check selectedLimit for validity.
        if (this.selectedLimit === null) {
            this.fire('message-error', "Select a time limit");
            console.error('Select a time limit');
            return;
        }
        
        // Reset our state variables before processing the new request
        this._gotLogs = false;
        this._tableView = false;
        this._loading = false;
        
        // Reset to a clean state of data
        this.splice('_allLogs', 0, this._allLogs.length);
        this.splice('_backpack', 0, this._backpack.length);
        this.splice('_pastActions', 0, this._pastActions.length);
        // Note we don't splice here since we're using the savedAction copy of the array, and we don't want to clear it
        this.set('_taskGroups', []);
        
        /** TODO NTFY-214 Can't query by date at the moment because the underlying MongoDB requires an ISODate object
        if (this._timeLimits[this.selectedLimit].date !== null) {
            this.query = {"$and":[{"time":{"$gte":{"$date": this._timeLimits[this.selectedLimit].date.toISOString()}}}]};
        }
        else {
            delete this.query.time;
        }
        */
        // TODO TEMPORARY Limit to action service
        this.query.service = 'action';
        
        // Grab our saved actions, and once that is done make a call to get our debug logs from the service
        this._loading = true;
        var _this = this;
        voyent.io.action.findActions({"realm":this.realm}).then(function(actions) {
            _this._savedActions = actions.length > 0 ? actions : null;
            
            _this._getDebugLogsCall(_this);
        }).catch(function(error) {
            _this.fire('message-error', "Error in get actions: " + error);
            console.error('Error in get actions:',error);
            _this._getDebugLogsCall(_this);
        });
    },
    
    /**
     * Service call to get our debug logs
     */
    _getDebugLogsCall: function() {
        var _this = this;
        voyent.io.admin.getDebugLogs({
            account: this.account,
            query: this.query,
            options: this.options,
            fields: this.fields
        }).then(this._fetchLogsCallback.bind(this)).catch(function(error){
            _this.fire('message-error', "Error in get debug logs: " + error);
            console.error('Error in get debug logs:',error);
            _this._loading = false; // Stop loading on error
        });
    },
    
    /**
     * Processes the logs returned from the auth service
     * @param logs
     * @private
     */
    _fetchLogsCallback: function(logs) {
        // We pull the logs with newest times first. But for parsing we want to order the reverse way
        // This is important so that "start" preceeds "end" for actions
        logs = logs.sort(function(a,b) {
            return new Date(a.time) - new Date(b.time);
        });
        
        // Loop through the returned logs
        // We want to achieve a few things here
        // 1. Populate the pastAction list and subsequent dropdown with a unique list of actions, including uncategorized
        // 2. Parse action/taskGroup/taskName from any log messages
        var strStart = 'start';
        var strEnd = 'end';
        var strParams = 'params';
        var strDebug = 'debug';
        var strTaskResult = 'Task Result';
        var currentLog = null;
        for (var i = 0; i < logs.length; i++) {
            currentLog = logs[i];
            currentLog.highlight = false;
            currentLog.action = null;
            currentLog.taskGroup = null;
            currentLog.taskItem = null;
            currentLog.isParams = false;
            currentLog.isDebug = false;
            
            // Using messagePrefix in order to allow for the previously existing checks against taskGroups to work with events containing arrays.
            var messagePrefix = currentLog.message.indexOf('{') !== -1 ? currentLog.message.split("{")[0] : currentLog.message;

            // start: mark a new past action
            if (currentLog.message.lastIndexOf(strStart, 0) === 0) {
                // There could be starts for taskGroups as well. We just want actions
                // The desired format is: start [action]
                // So look for exactly 2 brackets

                if (messagePrefix.split("[").length-1 === 1 && messagePrefix.split("]").length-1 === 1) {
                    // Trim out "start [action]" to "action"
                    currentLog.action = currentLog.message.substring((strStart + " [").length);
                    currentLog.action = currentLog.action.substring(0, currentLog.action.indexOf("]")).trim();

                    // Now we check if the parsed action matches a saved action for this user
                    // If not we ignore it, otherwise we'll continue
                    var match = false;
                    for (var savedAction = 0; savedAction < this._savedActions.length; savedAction++) {
                        if (currentLog.action === this._savedActions[savedAction]._id) {
                            match = true;
                        }
                    }

                    if (match) {
                        // First we look for a previous start of the same transaction code
                        // If we can't find it, we continue. This ensures we only have unique past actions
                        match = false;
                        for (var loopAction in this._pastActions) {
                            if ((currentLog.action === loopAction.name) && (currentLog.tx === loopAction.tx)) {
                                match = true;
                                break;
                            }
                        }

                        if (!match) {
                            this.push('_pastActions', {"name":currentLog.action,"tx":currentLog.tx,"startTime":currentLog.time,"startDate":this._formatTime(currentLog.time)});
                        }
                    }
                }

                // Always parse "start" from the message string so it can be handled properly later
                currentLog.message = currentLog.message.substring(strStart.length).trim();
                currentLog.message += strStart;
            }
            // end: marks the end of an action
            else if (currentLog.message.lastIndexOf(strEnd, 0) === 0) {
                if (messagePrefix.split("[").length-1 === 1 && messagePrefix.split("]").length-1 === 1) {
                    currentLog.action = currentLog.message.substring((strEnd + " [").length);
                    currentLog.action = currentLog.action.substring(0, currentLog.action.indexOf("]")).trim();

                    // Loop through our current past actions to try to find the start object
                    for (var endLoop = 0; endLoop < this._pastActions.length; endLoop++) {
                        if ((currentLog.action === this._pastActions[endLoop].name) && (currentLog.tx === this._pastActions[endLoop].tx)) {
                            // We only want to set the end date if it's valuable, namely different from start
                            if (this._pastActions[endLoop].startDate !== this._formatTime(currentLog.time)) {
                                this.set('_pastActions.' + endLoop + '.endDate', this._formatTime(currentLog.time));
                            }
                        }
                    }
                }

                // Always parse "end" from the message string so it can be handled properly later
                currentLog.message = currentLog.message.substring(strEnd.length).trim();
                currentLog.message += strEnd;
            }
            // Params: action level JSON object
            else if (currentLog.message.lastIndexOf(strParams, 0) === 0) {
                currentLog.message = currentLog.message.substring(strParams.length).trim();
                currentLog.isParams = true;
            }
            // Debug: custom user logging
            else if (currentLog.message.lastIndexOf(strDebug, 0) === 0) {
                currentLog.message = currentLog.message.substring(strDebug.length).trim();
                currentLog.isDebug = true;
            }
            // Task Result: backpack content
            else if (currentLog.message.lastIndexOf(strTaskResult, 0) === 0) {
                currentLog.message = currentLog.message.substring(strTaskResult.length).trim();
            }

            // Finally add our log entry if it's still valid
            if (currentLog !== null) {
                // Trim the action, taskGroup, and taskItem, as well as the remaining message
                if (currentLog.message.indexOf("[") === 0) {
                    this._trimContainer(currentLog, 'action');
                }
                if (currentLog.message.indexOf("[") === 0) {
                    this._trimContainer(currentLog, 'taskGroup');
                }
                if (currentLog.message.indexOf("[") === 0) {
                    this._trimContainer(currentLog, 'taskItem');
                }

                // If we are marked as `params` we want to prefix our message
                if (currentLog.isParams) {
                    currentLog.message = "Params:\n" + currentLog.message;
                }
                // Similarly if we're 'debug' prefix the message
                else if (currentLog.isDebug) {
                    currentLog.message = "Debug:\n" + currentLog.message;
                }
                // If we have an equal sign (=) starting our message, trim it, since the rest is probably JSON
                else if (currentLog.message.indexOf("=") === 0) {
                    currentLog.message = currentLog.message.substring(1).trim();
                }

                // Final trim, just in case
                currentLog.message = currentLog.message.trim();
                
                // Clean up extra variables
                if (currentLog.isParam) {
                    delete currentLog.isParam;
                }
                if (currentLog.isDebug) {
                    delete currentLog.isDebug;
                }

                // Store our finished log entry
                this.push('_allLogs', currentLog);
            }
        }

        // We do ANOTHER sort
        // Currently we're at newest entries first
        // But that doesn't visually make sense to a user reading the logs as each action would start with "end" instead of "start"
        // So basically we reverse the order to have the oldest entries first
        this._allLogs.sort(function(a,b) {
            return new Date(b.time) - new Date(a.time);
        });

        // Always add an uncategorized option that encompasses log entries not associated with anything
        this.splice('_pastActions', 0, 0, {"name":this.miscName});
        
        // Notify the user
        this.fire('message-info', "Log size is " + this._allLogs.length + " from " + logs.length + " entries");

        // Clear our old full logs
        logs.length = 0;

        // Done
        this._gotLogs = true;
        this._loading = false;
    },
    
    /**
     * Computed binding for a dom-repeat to sort past actions properly by newest first
     */
    _pastActionSort: function(a, b) {
        // Ensure that we always keep our misc name 'Uncategorized' at the top of the list
        if (a.name === this.miscName) {
            return -1;
        }
        if (b.name === this.miscName) {
            return 1;
        }
        // Otherwise sort as normal by time
        return new Date(b.startTime) - new Date(a.startTime);
    },
    
    /**
     * Function fired when the user clicks a past action to view the detailed contents in tier two
     * @param e event
     * @private
     */
    _viewBackpack: function(e) {
        this._currentAction = this._pastActions[e.target.getAttribute('data-workflow-item')];
        
        // Store our currently selected saved action as a set of task groups
        if (this._currentAction.name !== this.miscName) {
            for (var i = 0; i < this._savedActions.length; i++) {
                if (this._currentAction.name === this._savedActions[i]._id) {
                    this.set('_taskGroups', this._savedActions[i].taskGroups);
                    break;
                }
            }
            
            // Loop through the task groups and items and mark each one not highlighted
            var currentTaskGroup = null;
            for (var outerLoop = 0; outerLoop < this._taskGroups.length; outerLoop++) {
                currentTaskGroup = this._taskGroups[outerLoop];
                this.set('_taskGroups.' + outerLoop + '.highlight', false);
                
                for (var innerLoop = 0; innerLoop < currentTaskGroup.tasks.length; innerLoop++) {
                    this.set('_taskGroups.' + outerLoop + '.tasks.' + innerLoop + '.highlight', false);
                }
                if (this.isConditionalTaskGroup(currentTaskGroup)) {
                    for (var elseLoop = 0; elseLoop < currentTaskGroup.elseTasks.length; elseLoop++) {
                        this.set('_taskGroups.' + outerLoop + '.elseTasks.' + elseLoop + '.highlight', false);
                    }
                }
            }
        }
        else {
            // Clear the old task groups
            this.set('_taskGroups', []);
        }
        
        // Try to find matching log entries from our allLogs
        // Matches have the same action name, and most importantly the same tx code
        var loopLog = null;
        for (var j = 0; j < this._allLogs.length; j++) {
            // Always reset our highlight state to false
            this.set('_allLogs.' + j + '.highlight', false);
            
            loopLog = this._allLogs[j];
            
            // Account for Uncategorized action
            if ((this._currentAction.name === this.miscName) &&
                (loopLog.action === null)) {
                // Insert our item at the start, which means we'll end up sorted with oldest entries first
                this.splice('_backpack', 0, 0, this._allLogs[j]);
            }
            // Otherwise check action name and tx
            else {
                if (loopLog.action === null) {
                    // TODO If we want to add Uncategorized messages to the backpack uncomment below
                    //this.splice('_backpack', 0, 0, this._allLogs[j]);
                }
                else if (loopLog.action === this._currentAction.name) {
                    if (loopLog.tx === this._currentAction.tx) {
                        // Insert our item at the start, which means we'll end up sorted with oldest entries first
                        this.splice('_backpack', 0, 0, this._allLogs[j]);
                    }
                }
            }
        }
        
        // Reset our scrollbar for the table view to the top
        var _this = this;
        setTimeout(function() {
            if (document.getElementById(_this.tableWrapId)) {
                document.getElementById(_this.tableWrapId).scrollTop = 0;
            }
        },0);
        
        // Show the proper view
        this._tableView = true;
    },
    
    /**
     * Function called when the user clicks to view a different backpack, which
     *  means returning from tier two to tier one
     * @private
     */
    _chooseAnother: function() {
        this.set('_taskGroups', []);
        this.splice('_backpack', 0, this._backpack.length);
        this._tableView = false;
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
        
        return date.getFullYear() + "-" + ('0'+(date.getMonth()+1)).slice(-2) + "-" + ('0'+date.getDate()).slice(-2) + ", " +
               date.getHours() + ":" + ('0'+date.getMinutes()).slice(-2) + ":" + ('0'+date.getSeconds()).slice(-2) + "." + ('00'+date.getMilliseconds()).slice(-3);
    },
    
    /**
     * Format the past log entry container element, as well as the message
     * For example this will parse "[action] = text" to "= text", while also storing action
     * @param currentLog entry
     * @param container action, taskGroup, or taskItem
     * @private
     */
    _trimContainer: function(currentLog, container) {
        currentLog[container] = currentLog.message.substring(currentLog.message.indexOf("[")+1);
        currentLog[container] = currentLog[container].substring(0, currentLog[container].indexOf("]")).trim();
        currentLog.message = currentLog.message.substring(currentLog[container].length+2).trim(); // Remove [taskItem]
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
        
        if (taskName === null) {
            return;
        }
        
        var match = false;
        for (var i = 0; i < this._taskGroups.length; i++) {
            // Set our highlight
            match = (taskName === this._taskGroups[i].name);
            this.set('_taskGroups.' + i + '.highlight', match);
            
            // Reset all task items to not highlighted
            for (var j = 0; j < this._taskGroups[i].tasks.length; j++) {
                this.set('_taskGroups.' + i + '.tasks.' + j + '.highlight', false);
            }
            if (this.isConditionalTaskGroup(this._taskGroups[i])) {
                for (var k = 0; k < this._taskGroups[i].elseTasks.length; k++) {
                    this.set('_taskGroups.' + i + '.elseTasks.' + k + '.highlight', false);
                }
            }
        }
        
        this._viewGeneric(taskName);
    },
    
    /**
     * Event fired when a task item is clicked
     * We will take the clicked name and check it against our backpack list
     * Any messages that match will be highlighted
     * @param e event
     * @private
     */
    _viewItem: function(e) {
        var parent = e.target.getAttribute('data-parent-item');
        var taskName = e.target.getAttribute('data-workflow-item');
        
        if (parent === null || taskName === null) {
            return;
        }
        
        var match = false;
        var innerMatch = false;
        for (var i = 0; i < this._taskGroups.length; i++) {
            match = (parent === this._taskGroups[i].name);
            innerMatch = false;
            
            // Check our tasks first
            for (var j = 0; j < this._taskGroups[i].tasks.length; j++) {
                if (match) {
                    innerMatch = (taskName === this._taskGroups[i].tasks[j].name);
                }
                
                this.set('_taskGroups.' + i + '.tasks.' + j + '.highlight', innerMatch);
            }
            
            // Also need to check elseTasks if we're a conditional group
            if (this.isConditionalTaskGroup(this._taskGroups[i])) {
                for (var k = 0; k < this._taskGroups[i].elseTasks.length; k++) {
                    if (match) {
                        innerMatch = (taskName === this._taskGroups[i].elseTasks[k].name);
                    }
                    
                    this.set('_taskGroups.' + i + '.elseTasks.' + k + '.highlight', innerMatch);
                }
            }
            
            // Reset the task group highlight regardless, since we want to highlight a task item
            this.set('_taskGroups.' + i + '.highlight', false);
        }
        
        this._viewGeneric(parent, taskName);
    },
    
    /**
     * Generic convenience function that handles highlighting matching log messages
     *  from the passed task group/item
     * @param taskGroup
     * @param taskItem (optional)
     * @private
     */
    _viewGeneric: function(taskGroup, taskItem) {
        // We want to loop through our backpack messages and highlight any in the passed task item
        this.splice('_matchList', 0, this._matchList.length);
        
        var match = false;
        for (var i = 0; i < this._backpack.length; i++) {
            // First try to match on the parent task group
            if (taskGroup) {
                match = (taskGroup === this._backpack[i].taskGroup);
                
                // Then if we have a match AND a child task item, try to match on that
                if (match && taskItem) {
                    match = (taskItem === this._backpack[i].taskItem);
                }
            }
            
            this.set('_backpack.' + i + '.highlight', match);
            
            if (match) {
                this.push('_matchList', {"index":i});
            }
        }
        
        // Automatically scroll to the first item
        if (this.hasMatches()) {
            this._scrollGenericItem(0);
        }
    },
    
    /**
     * Scroll down to the next item for the selected task
     */
    _scrollNextItem: function() {
        this._scrollGenericItem(this._currentMatchIndex+1);
    },
    
    /**
     * Scroll up to the previous item for the selected task
     */
    _scrollPrevItem: function() {
        this._scrollGenericItem(this._currentMatchIndex-1);
    },
    
    /**
     * Combined function to scroll to a certain index in the list
     * This will also validate if the passed index is correct for the log list
     *
     * @param scrollIndex
     */
    _scrollGenericItem: function(scrollIndex) {
        this._currentMatchIndex = scrollIndex;
        
        // Account for the start/end of the list
        if (this._currentMatchIndex < 0) {
            this._currentMatchIndex = 0;
        }
        if (this._currentMatchIndex > (this._matchList.length-1)) {
            this._currentMatchIndex = this._matchList.length-1;
        }
        
        var _this = this;
        setTimeout(function() {
            if (document.getElementById(_this.tableWrapId)) {
                var childItem = document.getElementById('item' + _this._matchList[_this._currentMatchIndex].index);
                if (childItem) {
                    document.getElementById(_this.tableWrapId).scrollTop =
                        childItem.offsetTop - document.getElementById(_this.tableWrapId).offsetTop;
                }
            }
        },0);
    },
});