Polymer({
    is: "voyent-log-viewer",

    properties: {
        
        /**
         * Defines the Voyent account to view logs for.
         * @default voyent.io.auth.getLastKnownAccount()
         */
        account: { type: String },
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
        options: { type: Object, value: {} },
        /**
         * The number of log records to display on one page (0 for all matching log records).
         */
        pagesize: { type: Number, value: 100, observer: '_validatePageSize' },
        /**
         * Indicates if the pagination buttons should be rendered. Alternatively, the pagination functions can be accessed programmatically.
         */
        paginator: { type: Boolean, value: false },
        /**
         * Indicates if the header titles should be rendered.
         */
        header: { type: Boolean, value: false },
        /**
         * Indicates if the footer titles should be rendered.
         */
        footer: { type: Boolean, value: false },
        /**
         * Indicates if the debug logs should be shown rather than the audit.
         */
        debug: { type: Boolean, value: false },
        /**
         * Indicates if we should use local time in the table instead of UTC.
         */
        local: { type: Boolean, value: false },
        /**
         * Track what service (if any) is selected to filter on
         */
        filterService: { type: String, notify: true, observer: '_filterChanged' }
    },
    
    ready: function() {
        if (!this.account) {
            this.account = voyent.io.auth.getLastKnownAccount()
        }
        this._serviceList = null;
        this.fetchLogs();
        this._noLogs = false;
    },

    /**
     * Retrieve the log information from the Auth Service.
     */
    fetchLogs: function() {
        if( !this.account ){
            this.account = voyent.io.auth.getLastKnownAccount();
        }
        if (!this.account) {
            return;
        }
        this._hasLogs = false;
        //display all columns by default
        this._time = true;
        this._tx = true;
        this._service = true;
        this._realmName = true;
        this._username = true;
        this._message = true;
        
        // Set any filters into our query
        if (this.filterService !== null && typeof this.filterService !== 'undefined') {
            this.query.service = this.filterService;
        }
        else {
            delete this.query.service;
        }
        
        if (this.debug) {
            this._getDebugLogs();
        }
        else {
            this._getAuditLogs();
        }
    },

    /**
     * Load the last (least recent) page of logs.
     */
    lastPage: function() {
        var logs = this._logs;
        var pageSize = this.pagesize;

        var lastPageIndex = logs.length % pageSize;
        if (lastPageIndex === 0) {
            lastPageIndex = pageSize;
        }
        this._currentPage = logs.slice(0,lastPageIndex);
        this._currentPage.reverse();
        this._logIndex = lastPageIndex;
        this._hasPreviousPage = false;
        this._hasNextPage = true;
    },
    
    /**
     * Load the previous (less recent) page of logs.
     */
    previousPage: function() {
        var logs = this._logs;
        var pageSize = this.pagesize;
        var logIndex = this.lastAction === 'nextPage' ? this._logIndex - pageSize : this._logIndex;

        if (logIndex < pageSize) {
            pageSize = logIndex;
        }

        this._currentPage =  logs.slice(logIndex-pageSize,logIndex);
        this._currentPage.reverse();
        this._logIndex =  logIndex-pageSize;
        this._hasNextPage =  true;

        if (logIndex-pageSize === 0) {
            this._hasPreviousPage = false;
        }
        this.lastAction = 'previousPage';
    },
    
    /**
     * Load the next (more recent) page of logs.
     */
    nextPage: function() {
        var logs = this._logs;
        var pageSize = this.pagesize;
        var logIndex = this.lastAction === 'previousPage' ? this._logIndex + pageSize : this._logIndex;

        this._currentPage =  logs.slice(logIndex,logIndex+pageSize);
        this._currentPage.reverse();
        this._logIndex =  logIndex+pageSize;
        this._hasPreviousPage =  true;

        if (logIndex+pageSize >= logs.length) {
            this._hasNextPage = false;
        }
        this.lastAction = 'nextPage';
    },
    
    /**
     * Load the first (most recent) page of logs.
     */
    firstPage: function() {
        var logs = this._logs;
        var pageSize = this.pagesize;
        this._currentPage = logs.slice(logs.length-pageSize,logs.length);
        this._currentPage.reverse();
        this._logIndex = logs.length-pageSize;
        this._hasNextPage = false;
        this._hasPreviousPage = true;
    },
    
    //******************PRIVATE API******************
    
    /**
     * Reset the filter by service property
     */
    _resetFilters: function(e) {
        this.filterService = null;
    },
    
    /**
     * Change function called when the service filter changes, which will prompt a re-fetch of the logs
     */
    _filterChanged: function() {
        this.fetchLogs();
    },
    
    /**
     * Retrieve audit logs from the auth service.
     * @private
     */
    _getAuditLogs: function() {
        var _this = this;
        voyent.io.admin.getLogs({
            account: this.account,
            query: this.query,
            options: this.options,
            fields: this.fields
        }).then(this._fetchLogsCallback.bind(this)).catch(function(error){
            _this.fire('message-error', 'fetchLogs (audit) caught an error: ' + error);
            console.error('fetchLogs (audit) caught an error:',error);
            _this._noLogs = true;
        });
    },

    /**
     * Retrieve debug logs from the auth service.
     * @private
     */
    _getDebugLogs: function() {
        var _this = this;
        voyent.io.admin.getDebugLogs({
            account: this.account,
            query: this.query,
            options: this.options,
            fields: this.fields
        }).then(this._fetchLogsCallback.bind(this)).catch(function(error){
            _this.fire('message-error', 'fetchLogs (debug) caught an error: ' + error);
            console.error('fetchLogs (debug) caught an error:',error);
            _this._noLogs = true;
        });
    },

    /**
     * Processes the logs returned from the auth service.
     * @param logs
     * @private
     */
    _fetchLogsCallback: function(logs) {
        logs.reverse();
        if (logs.length === 0) {
            this._logs = null;
            this._noLogs = true;
            return;
        }
        
        if ((logs.length > this.pagesize) && (this.pagesize !== 0)) {
            this._currentPage = logs.slice(logs.length-this.pagesize,logs.length);
            this._logIndex = logs.length-this.pagesize;
            this._hasPreviousPage = true;
        }
        else {
            this._currentPage = logs;
            this._hasPreviousPage = false;
        }
        this._currentPage.reverse();
        this._hasNextPage = false;
        this._logs = logs;
        this._hasLogs = true;
        this._noLogs = false;
        
        // If we haven't generated a services list yet from the returned logs we will now
        if (this._serviceList === null) {
            this._serviceList = [];
            var currentLog;
            for (var i = 0; i < this._logs.length; i++) {
                currentLog = this._logs[i];
                
                if (this._serviceList.indexOf(currentLog.service) === -1) {
                    this.push('_serviceList', currentLog.service);
                }
            }
            
            // Sort the services
            this.set('_serviceList', this._serviceList.sort());
        }

        if (Object.keys(this.fields).length > 0) {
            this._hideColumns();
        }
        this._determinePaginatorLabels();
    },

    /**
     * Dynamically determine the paginator labels based on what order the logs are displayed in.
     * @private
     */
    _determinePaginatorLabels: function() {
        if (this._logs[0].time > this._logs[this._logs.length-1].time) {
            this.lastPageLabel = 'Latest';
            this.previousPageLabel = 'Later';
            this.nextPageLabel= 'Earlier';
            this.firstPageLabel = 'Earliest';
        }
        else {
            this.lastPageLabel = 'Earliest';
            this.previousPageLabel = 'Earlier';
            this.nextPageLabel= 'Later';
            this.firstPageLabel = 'Latest';
        }
    },

    /**
     * Format the time into a special long format that includes milliseconds.
     * @return {string} of the formatted date
     * @private
     */
    _formatDate: function(ISODate) {
        if (!this.local) {
            return ISODate;
        }
        var date = new Date(ISODate);
        // Format the values properly (make sure we have sufficient zeroes)
        var minuteFormatted = ('0'+date.getMinutes()).slice(-2),
            secondFormatted = ('0'+date.getSeconds()).slice(-2),
            millisecondFormatted = ('00'+date.getMilliseconds()).slice(-3);
        // Get the original long format date to parse
        var toParse = date.toString();
        // Now get the time string used in the long format, such as 12:46:35
        var timeString = date.getHours() + ":" + minuteFormatted + ":" + secondFormatted;
        // Now we insert the milliseconds value from the date into our long format string
        var datetime = toParse.substring(0, toParse.indexOf(timeString)+timeString.length) + "." + millisecondFormatted;
        // Now we get the timezone from the original date
        var timezone = toParse.substring(toParse.indexOf(timeString)+timeString.length);
        // Return new modified long format date
        return datetime+timezone;
    },

    /**
     * Validates the pagesize attribute. If invalid, the old value, or the default will be used.
     * @param newVal
     * @param oldVal
     * @private
     */
    _validatePageSize: function(newVal, oldVal) {
        if (isNaN(newVal) || (newVal%1)!==0 || newVal < 0) {
            this.pagesize = oldVal || 100;
        }
    },

    /**
     * Hides columns that have been excluded with the fields attribute.
     * @private
     */
    _hideColumns: function() {
        for (var key in this.fields) {
            if (this.fields.hasOwnProperty(key)) {
                this['_'+key] = false;
            }
        }
    },

    /**
     * Template helper function to generate the class for tr elements. 
     * @param level
     * @returns {string}
     * @private
     */
    _computeTrClass: function(level) {
      return 'tr '+level;  
    }
});
