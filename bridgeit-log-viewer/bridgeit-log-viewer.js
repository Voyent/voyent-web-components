var _lViewer;

Polymer({
    is: "bridgeit-log-viewer",

    properties: {
        /**
         * Required to authenticate with BridgeIt.
         * @default bridgeit.io.auth.getLastAccessToken()
         */
        accesstoken: { type: String, value: bridgeit.io.auth.getLastAccessToken() },
        /**
         * Defines the BridgeIt account to view logs for.
         * @default bridgeit.io.auth.getLastKnownAccount()
         */
        account: { type: String, value: bridgeit.io.auth.getLastKnownAccount() },
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
        footer: { type: Boolean, value: false }
    },

    created: function() {
        _lViewer = this;
    },

    ready: function() {
        _lViewer.fetchLogs();
        _lViewer._noLogs = false;
    },

    /**
     * Retrieve the log information from the Auth Service.
     */
    fetchLogs: function() {
        if (!_lViewer.accesstoken || !_lViewer.account) {
            return;
        }
        _lViewer._hasLogs = false;
        //display all columns by default
        _lViewer._time = true;
        _lViewer._tx = true;
        _lViewer._service = true;
        _lViewer._realmName = true;
        _lViewer._username = true;
        _lViewer._message = true;

        bridgeit.io.admin.getLogs({
            accessToken: _lViewer.accesstoken,
            account: _lViewer.account,
            query: _lViewer.query,
            options: _lViewer.options,
            fields: _lViewer.fields
        }).then(function(logs) {
            if (logs.length === 0) {
                _lViewer._logs = null;
                _lViewer._noLogs = true;
                return;
            }
            if ((logs.length > _lViewer.pagesize) && (_lViewer.pagesize !== 0)) {
                _lViewer._currentPage = logs.slice(logs.length-_lViewer.pagesize,logs.length);
                _lViewer._logIndex = logs.length-_lViewer.pagesize;
                _lViewer._hasPreviousPage = true;
            }
            else {
                _lViewer._currentPage = logs;
                _lViewer._hasPreviousPage = false;
            }
            _lViewer._hasNextPage = false;
            _lViewer._logs = logs;
            _lViewer._hasLogs = true;
            _lViewer._noLogs = false;

            if (Object.keys(_lViewer.fields).length > 0) {
                _lViewer._hideColumns();
            }
        }).catch(function(error){
            console.log('fetchLogs caught an error:', error);
        });
    },

    /**
     * Load the last (least recent) page of logs.
     */
    lastPage: function() {
        var logs = _lViewer._logs;
        var pageSize = _lViewer.pagesize;

        var lastPageIndex = logs.length % pageSize;
        if (lastPageIndex === 0) {
            lastPageIndex = pageSize;
        }
        _lViewer._currentPage = logs.slice(0,lastPageIndex);
        _lViewer._logIndex = lastPageIndex;
        _lViewer._hasPreviousPage = false;
        _lViewer._hasNextPage = true;
    },
    
    /**
     * Load the previous (less recent) page of logs.
     */
    previousPage: function() {
        var logs = _lViewer._logs;
        var pageSize = _lViewer.pagesize;
        var logIndex = _lViewer.lastAction === 'nextPage' ? _lViewer._logIndex - pageSize : _lViewer._logIndex;

        if (logIndex < pageSize) {
            pageSize = logIndex;
        }

        _lViewer._currentPage =  logs.slice(logIndex-pageSize,logIndex);
        _lViewer._logIndex =  logIndex-pageSize;
        _lViewer._hasNextPage =  true;

        if (logIndex-pageSize === 0) {
            _lViewer._hasPreviousPage = false;
        }
        _lViewer.lastAction = 'previousPage';
    },
    
    /**
     * Load the next (more recent) page of logs.
     */
    nextPage: function() {
        var logs = _lViewer._logs;
        var pageSize = _lViewer.pagesize;
        var logIndex = _lViewer.lastAction === 'previousPage' ? _lViewer._logIndex + pageSize : _lViewer._logIndex;

        _lViewer._currentPage =  logs.slice(logIndex,logIndex+pageSize);
        _lViewer._logIndex =  logIndex+pageSize;
        _lViewer._hasPreviousPage =  true;

        if (logIndex+pageSize >= logs.length) {
            _lViewer._hasNextPage = false;
        }
        _lViewer.lastAction = 'nextPage';
    },
    
    /**
     * Load the first (most recent) page of logs.
     */
    firstPage: function() {
        var logs = _lViewer._logs;
        var pageSize = _lViewer.pagesize;
        _lViewer._currentPage = logs.slice(logs.length-pageSize,logs.length);
        _lViewer._logIndex = logs.length-pageSize;
        _lViewer._hasNextPage = false;
        _lViewer._hasPreviousPage = true;
    },


    //******************PRIVATE API******************

    /**
     * Validates the pagesize attribute. If invalid, the old value, or the default will be used.
     * @param newVal
     * @param oldVal
     * @private
     */
    _validatePageSize: function(newVal, oldVal) {
        if (isNaN(newVal) || (newVal%1)!==0 || newVal < 0) {
            _lViewer.pagesize = oldVal || 100;
        }
    },

    /**
     * Hides columns that have been excluded with the fields attribute.
     * @private
     */
    _hideColumns: function() {
        for (var key in _lViewer.fields) {
            if (_lViewer.fields.hasOwnProperty(key)) {
                _lViewer['_'+key] = false;
            }
        }
    }
});
