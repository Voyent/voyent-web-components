Polymer({
    is: "bridgeit-log-viewer",

    properties: {
        
        /**
         * Defines the BridgeIt account to view logs for.
         * @default bridgeit.io.auth.getLastKnownAccount()
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
         * Additional query options such as limit and sort.
         *
         * Example:
         *
         *      //all records + sort by service (ascending)
         *      {"limit":0,"sort":{"service":1}}
         */
        options: { type: Object, value: {} },
        /**
         * The number of log records to display on one page (0 for all matching log records).
         */
        pagesize: { type: Number, value: 100, observer: '_validatePageSize' },
        /**
         * Flag indicating if the pagination buttons should be rendered. Alternatively, the pagination functions can be accessed directly.
         */
        paginator: { type: Boolean, value: false },
        /**
         * Flag indicating if the header titles should be rendered.
         */
        header: { type: Boolean, value: false },
        /**
         * Flag indicating if the footer titles should be rendered.
         */
        footer: { type: Boolean, value: false },
        /**
         * Flag indicating if the debug logs should be shown rather than the audit.
         */
        debug: { type: Boolean, value: false }
    },

    ready: function() {
        if (!this.account) {
            this.account = bridgeit.io.auth.getLastKnownAccount()
        }
        this.fetchLogs();
        this._noLogs = false;
    },

    /**
     * Retrieve the log information from the Auth Service.
     */
    fetchLogs: function() {
        if( !this.account ){
            this.account = bridgeit.io.auth.getLastKnownAccount();
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
        this._logIndex = logs.length-pageSize;
        this._hasNextPage = false;
        this._hasPreviousPage = true;
    },


    //******************PRIVATE API******************

    /**
     * Retrieve audit logs from the auth service.
     * @private
     */
    _getAuditLogs: function() {
        var _this = this;
        bridgeit.io.admin.getLogs({
            account: this.account,
            query: this.query,
            options: this.options,
            fields: this.fields
        }).then(this._fetchLogsCallback.bind(this)).catch(function(error){
            console.log('fetchLogs (audit) caught an error:', error);
            _this.fire('bridgeit-error', {error: error});
            _this._noLogs = true;
        });
    },

    /**
     * Retrieve debug logs from the auth service.
     * @private
     */
    _getDebugLogs: function() {
        var _this = this;
        bridgeit.io.admin.getDebugLogs({
            account: this.account,
            query: this.query,
            options: this.options,
            fields: this.fields
        }).then(this._fetchLogsCallback.bind(this)).catch(function(error){
            console.log('fetchLogs (debug) caught an error:', error);
            _this.fire('bridgeit-error', {error: error});
            _this._noLogs = true;
        });
    },

    /**
     * Processes the logs returned from the auth service.
     * @param logs
     * @private
     */
    _fetchLogsCallback: function(logs) {
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
        this._hasNextPage = false;
        this._logs = logs;
        this._hasLogs = true;
        this._noLogs = false;

        if (Object.keys(this.fields).length > 0) {
            this._hideColumns();
        }
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
    }
});
