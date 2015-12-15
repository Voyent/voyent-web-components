var BridgeIt = BridgeIt || {};

BridgeIt.QueryEditor = Polymer({
    is: "bridgeit-query-editor",

    /**
     * Custom constructor. Sets any passed properties (or the defaults) and calls `reloadEditor`.
     * @param account
     * @param realm
     * @param service
     * @param collection
     * @param fields
     * @param options
     * @param queryurltarget
     */
    factoryImpl: function(account,realm,service,collection,fields,options,queryurltarget) {
        this.account = account || null;
        this.realm = realm || null;
        this.service = service || 'documents';
        this.collection = collection || 'documents';
        this.fields = fields || {};
        this.options = options || {};
        this.queryurltarget = queryurltarget || null;
        this.reloadEditor();
    },

    properties: {
        /**
         * Defines the BridgeIt realm to build queries for.
         * @default bridgeit.io.auth.getLastKnownRealm()
         */
        realm: { type: String },
        /**
         * Defines the BridgeIt account to build queries for.
         * @default bridgeit.io.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * The service that you would like to build the query for. Currently `documents`, `location` and `metrics` are supported.
         */
        service: { type: String, value: 'documents' },
        /**
         * The collection that you would like to build the query for. This initial dataset determines the fields available in the editor.
         */
        collection: { type: String, value: 'documents' },
        /**
         * Specify the inclusion or exclusion of fields to return in the result set.
         *
         * Example:
         *
         *      //exclude _id column
         *      {"_id":0}
         */
        fields: { type: Object, value: {} },
        /**
         * Additional query options such as limit and sort.
         *
         * Example:
         *
         *      //sort by _id (descending) + get only 100 records
         *      {"sort":{"_id":-1},"limit":100}
         */
        options: { type: Object, value: {} },
        /**
         * Element ID of where the GET URL of the query will be displayed as the query is built. Supports input and non-input elements.
         */
        queryurltarget: { type: String },
        /**
         * A string representation of the object returned from the `queryExecuted` event. Use when data binding is preferred over event listeners.
         */
        queryresults: { type: String, notify: true, readOnly: true },
        /**
         * A string representation of the results array returned from the `queriesRetrieved` event. Use when data binding is preferred over event listeners.
         */
        querylistresults: { type: String, notify: true, readOnly: true }
    },

    /**
     * Fired after a query is executed, this occurs on the initial load and when calling `runQuery` or `reloadEditor`. Contains the query results and the unique fields.
     *
     * @event queryExecuted
     */

    /**
     * Fired after the query list is retrieved, this occurs on the initial load and when calling `fetchQueryList`, `saveQuery`, `cloneQuery`, `deleteQuery`. Contains the list of saved queries in this realm.
     *
     * @event queriesRetrieved
     */

    /**
     * Fired whenever there is a message for an action that was triggered. Contains the message and the message type (info, error).
     *
     * @event queryMsgUpdated
     */

    created: function() {
        var _this = this;

        var jqueryBuilderURL = this.resolveUrl('./jquery-builder-import.html');
        if (!('jQuery' in window)) {
            //load missing jQuery dependency
            this.importHref('../jquery-import/jquery-import.html', function(e) {
                document.head.appendChild(document.importNode(e.target.import.body,true));
                onAfterjQueryLoaded();
            }, function(err) {
                console.error('bridgeit-query-editor: error loading jquery', err);
            });
        }
        else { onAfterjQueryLoaded(); }

        function onAfterjQueryLoaded() {
            //load missing jQuery-QueryBuilder dependency
            if (!$.fn.queryBuilder) {
                _this.importHref(jqueryBuilderURL, function(e) {
                    document.head.appendChild(document.importNode(e.target.import.body,true));
                    _this._initialize();
                }, function(err) {
                    console.error('bridgeit-query-editor: error loading jquery builder', err);
                });
            }
            else { _this._initialize(); }
        }
    },

    _initialize: function() {
        if (!this.realm) {
            this.realm = bridgeit.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = bridgeit.io.auth.getLastKnownAccount();
        }
        this.reloadEditor();
        this.fetchQueryList();
    },

    /**
     * Execute the current query.
     */
    runQuery: function() {
        var query = $(this.$.editor).queryBuilder('getMongo');
        if (Object.keys(query).length !== 0) {
            this._processTimeFields(query,true);
            this._queryService(query);
        }
    },

    /**
     * Creates or updates a query using the provided parameters.
     * If there is an active query in the editor then the ID parameter will be ignored and the query will be updated. Otherwise a new query is created using the provided or server generated ID.
     * @param id - The query ID, ignored if doing an update
     * @param description - Optional query description
     * @param services - Optional services array
     */
    saveQuery: function(id,description,services) {
        var query = this._buildQuery(id,description,services,false);
        if (query !== null) {
            this._createQuery(query);
        }
    },

    /**
     *  Similar to `saveQuery` but this function will prompt for the query id and does not provide a way to set description and services.
     */
    saveQueryWithPrompt: function() {
        if (!this.validateQuery()) { return; }
        var queryId;
        if (!this.activeQuery) {
            queryId = window.prompt("Please enter the new query name","Auto-Named");
            if (!queryId || queryId === "Auto-Named" || queryId.trim().length === 0) {
                queryId = null;
            }
        }
        var query = this._buildQuery(queryId,null,null,false);
        if (query !== null) {
            this._createQuery(query);
        }
    },

    /**
     * Clones the currently active query using the provided parameters.
     * @param id - The query ID, generated by the service if not provided
     * @param description - Optional query description, if not provided then the existing value, if any, will be cloned
     * @param services - Optional services array, if not provided then the existing value, if any, will be cloned
     */
    cloneQuery: function(id,description,services) {
        if (!this.activeQuery) {
            this.fire('queryMsgUpdated',{id:this.id ? this.id : null, message: 'No query to clone.','type':'error'});
            return;
        }
        var query = this._buildQuery(id,description,services,true);
        if (query !== null) {
            this._createQuery(query);
        }
    },

    /**
     * Similar to `cloneQuery` but this function will prompt for the query id and does not provide a way to set description and services.
     */
    cloneQueryWithPrompt: function() {
        if (!this.activeQuery) {
            this.fire('queryMsgUpdated',{id:this.id ? this.id : null, message: 'No query to clone.','type':'error'});
            return;
        }
        if (!this.validateQuery()) { return; }
        var queryId;
        queryId = window.prompt("Please enter the new query name","Auto-Named");
        if (!queryId || queryId === "Auto-Named" || queryId.trim().length === 0) {
            queryId = null;
        }
        var query = this._buildQuery(queryId,null,null,true);
        if (query !== null) {
            this._createQuery(query);
        }
    },

    /**
     * Deletes the currently active query.
     */
    deleteQuery: function() {
        if (!this.activeQuery || !this.activeQuery._id) {
            this.fire('queryMsgUpdated',{id:this.id ? this.id : null, message: 'No query to delete.','type':'error'});
            return;
        }
        this._deleteQuery();
    },

    /**
     * Clears the query editor and restores the `fields` and `options` attributes to their original values.
     */
    resetEditor: function() {
        $(this.$.editor).queryBuilder('reset');
        this.options = JSON.parse(this.getAttribute('options')) || {};
        this.fields = JSON.parse(this.getAttribute('fields')) || {};
        this.activeQuery = null;
        this._setQueryHeader(null);
        this._updateQueryURL();
        this._queryService({});
    },

    /**
     * Retrieves a list of all the queries in the current realm.
     */
    fetchQueryList: function() {
        if (!bridgeit.io.auth.isLoggedIn() || !this.realm || !this.account || !this.service || !this.collection) {
            return;
        }
        this._getAllQueries();
    },

    /**
     * Populate the editor from an existing query.
     * @param query - The query in object form.
     */
    setEditorFromMongo: function(query) {
        this.skipListeners = true;
        this.options = query.options || {};
        this.fields = query.fields || {};
        try {
            this._processTimeFields(query.query,false);
            $(this.$.editor).queryBuilder('setRulesFromMongo',query.query);
            this.activeQuery = query;
            this._setQueryHeader(query);
        }
        catch (e) {
            var errorMsg = 'Unable to populate query editor. ';
            if (e.message.indexOf('Undefined filter') !== -1) {
                errorMsg = errorMsg + '"' + e.message.split('Undefined filter: ').join('') + '"' + ' field does not exist in this database.';
            }
            else {
                errorMsg = errorMsg + e.message;
            }
            this.fire('queryMsgUpdated',{id:this.id ? this.id : null, message: errorMsg,'type':'error'});
        }
        this._updateQueryURL(query.query);
        this.skipListeners = false;
    },

    /**
     * Completely destroy and reinitialize the editor.
     */
    reloadEditor: function() {
        if (!bridgeit.io.auth.isLoggedIn() || !this.realm || !this.account || !this.service || !this.collection) {
            return;
        }
        this._queryService({},true);
        this._updateQueryURL();
    },

    /**
     * Test if the current query is valid.
     * @return {boolean} Indicates if the query is valid.
     */
    validateQuery: function() {
        return Object.keys($(this.$.editor).queryBuilder('getMongo')).length > 0;
    },

    /**
     * Return the query that is currently built in the editor.
     * @returns {object}
     */
    getQuery: function() {
        return $(this.$.editor).queryBuilder('getMongo');
    },


    //******************PRIVATE API******************

    _createQuery: function(query) {
        var _this = this;
        var params = {
            account: this.account,
            realm: this.realm,
            query: query
        };
        var func = 'createQuery';
        if (this.allQueries.indexOf(query._id) > -1) {
            func = 'updateQuery';
        }
        if (query._id) {
            params.id = query._id;
            delete query._id;
        }
        bridgeit.io.query[func](params).then(function(uri) {
            var queryId = _this.activeQuery._id;
            if (uri) {
                queryId = uri.split("/").pop();
            }
            query._id = queryId;
            _this.activeQuery = query;
            _this._setQueryHeader(_this.activeQuery);
            _this.fetchQueryList();
            _this.fire('queryMsgUpdated',{id:_this.id ? _this.id : null, message: 'Query "'+queryId+'" saved','type':'info'});
        }).catch(function(error){
            console.log('createQuery caught an error:', error);
            _this.fire('bridgeit-error', {error: error});
        });
    },
    _deleteQuery: function() {
        var _this = this;
        var queryId = this.activeQuery._id;
        bridgeit.io.query.deleteQuery({
            id:queryId,
            account: this.account,
            realm: this.realm
        }).then(function() {
            _this.fire('queryMsgUpdated',{id:_this.id ? _this.id : null, message: 'Query "'+queryId+'" deleted','type':'info'});
            _this.resetEditor();
            _this.fetchQueryList();
        }).catch(function(error){
            console.log('deleteQuery caught an error:', error);
            _this.fire('bridgeit-error', {error: error});
        });
    },
    _getAllQueries: function() {
        var _this = this;
        bridgeit.io.query.findQueries({
            account:this.account,
            realm: this.realm
        }).then(function(results) {
            _this.allQueries = results.map(function(query) {
                return query._id;
            });
            _this._setQuerylistresults(results);
            _this.fire('queriesRetrieved',{results: results});
        }).catch(function(error){
            console.log('fetchQueryList caught an error:', error);
            _this.fire('bridgeit-error', {error: error});
        });
    },
    _buildQuery: function(id,description,services,isClone) {
        var query = $(this.$.editor).queryBuilder('getMongo');
        if (Object.keys(query).length === 0) {
            return null;
        }
        this._processTimeFields(query,true);
        var queryToPost = {
            "query": query,
            "fields": this.getAttribute('fields') ? this.getAttribute('fields') : {},
            "options": this.getAttribute('options') ? this.getAttribute('options') : {},
            "properties":{}
        };
        if (typeof queryToPost.fields === 'string') {
            queryToPost.fields = JSON.parse(queryToPost.fields);
        }
        if (typeof queryToPost.options === 'string') {
            queryToPost.options = JSON.parse(queryToPost.options);
        }
        if (id && $.type(id) == 'string' && id.toString().length > 0) {
            queryToPost._id = id;
        }
        if ((this.activeQuery && isClone) || !this.activeQuery) {
            if (checkQueryName(queryToPost._id)) {
                return null;
            }
        }

        if (this.activeQuery) {
            if (!isClone) {
                queryToPost._id = this.activeQuery._id;
            }
            if (this.activeQuery.properties) {
                queryToPost.properties = this.activeQuery.properties;
            }
        }
        else {
            this.activeQuery = queryToPost; //set the activeQuery without the ID, ID wil be added in the save callback
        }

        if (description && $.type(description) == 'string' && description.trim().length > 0) {
            queryToPost.properties.description = description;
        }
        else {
            if (queryToPost.properties && queryToPost.properties.description) {
                delete queryToPost.properties.description;
            }
        }
        if (services && $.type(services) == 'array' && services.length > 0) {
            queryToPost.properties.services = services;
        }
        else {
            if (queryToPost.properties && queryToPost.properties.services) {
                delete queryToPost.properties.services;
            }
        }
        if (Object.keys(queryToPost.properties).length === 0) {
            delete queryToPost.properties;
        }
        return queryToPost;

        function checkQueryName(name) {
            var allQueries = this.allQueries;
            if (allQueries && allQueries.length > 0) {
                var queryExists=false;
                if (!name) {
                    return queryExists;
                }
                for (var i=0; i<allQueries.length; i++) {
                    if (allQueries[i] === name) {
                        queryExists=true;
                        break;
                    }
                }
                if (queryExists) {
                    this.fire('queryMsgUpdated',{id:this.id ? this.id : null, message: 'The query name "'+name+'" already exists in this realm, please choose a different one.','type':'error'});
                }
                return queryExists;
            }
        }
    },
    _refreshQuery: function() {
        var query = $(this.$.editor).queryBuilder('getMongo');
        if (Object.keys(query).length !== 0) {
            this._processTimeFields(query,true);
            this._updateQueryURL(query);
        }
    },
    _processTimeFields: function(query,toUTC) {
        var _this = this;
        var doProcess = function (query) {
            for (var key in query) {
                if (!query.hasOwnProperty(key)) {
                    continue;
                }
                var value = query[key];
                if (key === 'time') {
                    if (typeof value === 'string' || value instanceof String) {
                        if (toUTC) {
                            query[key] = _this._toUTCTime(value);
                        }
                        else {
                            query[key] = _this._toLocalTime(value);
                        }
                    }
                    else if (value !== null && typeof value === 'object') {
                        for (var op in value) {
                            if (!value.hasOwnProperty(op)) {
                                continue;
                            }
                            var timeValue = value[op];
                            if (typeof timeValue === 'string' || timeValue instanceof String) {
                                if (toUTC) {
                                    value[op] = _this._toUTCTime(timeValue);
                                }
                                else {
                                    value[op] = _this._toLocalTime(timeValue);
                                }
                            }
                            else if (Array.isArray(timeValue)) {
                                for (var i=0; i<timeValue.length; i++) {
                                    if (toUTC) {
                                        value[op][i] = _this._toUTCTime(timeValue[i]);
                                    }
                                    else {
                                        value[op][i] = _this._toLocalTime(timeValue[i]);
                                    }
                                }
                            }
                        }
                    }
                }
                else {
                    if (value !== null && typeof value === 'object') {
                        doProcess(value);
                    }
                }
            }
        };
        doProcess(query);
    },
    _toUTCTime: function(val) {
        var newVal;
        try {
            newVal = new Date(val).toISOString();
        }
        catch (e) {
            try {
                // If we have a '.' then assume milliseconds are present
                // Such as the modified long format Fri Nov 20 2015 12:26:38.769 GMT-0700 (MST)
                if (val.indexOf('.') !== -1) { //TODO - Need proper regex solution
                    // First we parse out milliseconds, in the above example this would be "769"
                    var millis = val.substring(val.indexOf('.')+1, val.indexOf(' ', val.indexOf('.')));
                    // Then we rebuild the string without milliseconds, so back to the standard Date long format
                    var toParse = val.substring(0, val.indexOf('.')) +
                        val.substring(val.indexOf('.' + millis)+1+millis.length);
                    // Now we parse a Date object from that long format
                    var parsedDate = new Date(toParse);
                    // And set in our milliseconds
                    parsedDate.setMilliseconds(millis);
                    // Then we convert this to ISO UTC format
                    newVal = parsedDate.toISOString();
                }
            }
            catch (e) { }
        }
        return newVal ? newVal : val;
    },
    _toLocalTime: function(val) {
        var newVal;
        try {
            var dateObj = new Date(val);
            // Get the original long format date to parse
            var toParse = dateObj.toString();
            if (toParse === 'Invalid Date') {
                return val;
            }
            // Format the minute properly
            var minute = dateObj.getMinutes(),
                minuteFormatted = minute < 10 ? "0" + minute : minute, // pad with 0 as needed
                second = dateObj.getSeconds(),
                secondFormatted = second < 10 ? "0" + second : second; // pad with 0 as needed
            // Now get the time string used in the long format, such as 12:46:35
            var timeString = dateObj.getHours() + ":" + minuteFormatted + ":" + secondFormatted;
            // Now we insert the milliseconds value from the date into our long format string
            // This will turn: Fri Nov 20 2015 12:26:38 GMT-0700 (MST)
            // into:           Fri Nov 20 2015 12:26:38.769 GMT-0700 (MST)
            var milliseconds = dateObj.getMilliseconds().toString();
            if (milliseconds.toString().length == 1) {
                milliseconds = '00'+milliseconds;
            }
            else if (milliseconds.toString().length == 2) {
                milliseconds = '0'+milliseconds;
            }
            newVal = toParse.substring(0, toParse.indexOf(timeString)+timeString.length) +
                "." + milliseconds +
                toParse.substring(toParse.indexOf(timeString)+timeString.length);
        }
        catch(e) { newVal = null; }
        return newVal ? newVal : val;
    },
    _setQueryHeader: function(query) {
        var container = Polymer.dom(this.root).querySelector('#editor_group_0');
        if (!query || !query._id) {
            if (Polymer.dom(this.root).querySelector('#queryTitle')) {
                container.removeChild(Polymer.dom(this.root).querySelector('#queryTitle'));
            }
            return;
        }
        var div;
        if (!Polymer.dom(this.root).querySelector('#queryTitle')) {
            div = document.createElement("div");
            div.id='queryTitle';
            div.className = 'activeQuery';
            div.innerHTML = query._id;
            container.insertBefore(div, container.firstChild);
        }
        else {
            div = Polymer.dom(this.root).querySelector('#queryTitle');
            div.innerHTML = query._id;
        }
        if (query.properties && query.properties.description) {
            div.innerHTML = div.innerHTML+'<br><span>'+query.properties.description+'</span>';
        }
    },
    _updateQueryURL: function(query) {
        var queryURLTarget = this.queryurltarget;
        if (queryURLTarget && document.getElementById(queryURLTarget)) {
            var q = query ? JSON.stringify(query) : '{}';
            var params = '?access_token='+bridgeit.io.auth.getLastAccessToken()+'&query='+q+'&fields='+JSON.stringify(this.fields)+'&options='+JSON.stringify(this.options);
            var queryURL = this.service_url+params;
            if ($(queryURLTarget).is(':input')) {
                document.getElementById(queryURLTarget).value=queryURL;
            }
            else {
                document.getElementById(queryURLTarget).innerHTML=queryURL;
                if (document.getElementById(queryURLTarget).tagName === 'A') {
                    document.getElementById(queryURLTarget).href=queryURL;
                }
            }
        }
    },
    _queryService: function(query,destroy) {
        var _this = this;
        var params = {
            accessToken: bridgeit.io.auth.getLastAccessToken(),
            account: this.account,
            realm: this.realm,
            query: query,
            fields: this.fields,
            options: this.options
        };
        var protocol = 'http://';
        var path = '/'+this.account+'/realms/'+this.realm+'/'+this.collection;
        switch(this.service.toLowerCase()) {
            case 'documents':
                params.collection = this.collection;
                this.service_url = protocol+bridgeit.io.documentsURL+path;
                bridgeit.io.documents.findDocuments(params).then(successCallback).catch(function(error){
                    console.log('findDocuments caught an error:', error);
                });
                break;
            case 'location':
                switch (this.collection.toLowerCase()) {
                    case 'locations':
                        bridgeit.io.location.findLocations(params).then(successCallback).catch(function(error){
                            console.log('findLocations caught an error:', error);
                        });
                        break;
                    case 'regions':
                        bridgeit.io.location.findRegions(params).then(successCallback).catch(function(error){
                            console.log('findRegions caught an error:', error);
                        });
                        break;
                    case 'poi':
                        bridgeit.io.location.findPOIs(params).then(successCallback).catch(function(error){
                            console.log('findPOIs caught an error:', error);
                        });
                        break;
                    default:
                        this.fire('queryMsgUpdated',{id:this.id ? this.id : null, message: 'Location Service Collection "' + this.collection + '" not supported.','type':'error'});
                }
                this.service_url = protocol+bridgeit.io.locateURL+path;
                break;
            case 'metrics':
                params.collection = this.collection;
                this.service_url = protocol+bridgeit.io.metricsURL+path;
                bridgeit.io.metrics.findEvents(params).then(successCallback).catch(function(error){
                    console.log('findEvents caught an error:', error);
                });
                break;
            default:
                this.fire('queryMsgUpdated',{id:this.id ? this.id : null, message: 'Service "' + this.service + '" not supported.','type':'error'});
        }
        function successCallback(results) {
            var obj = {};
            if( results && results.length > 0) {
                determineFields(results);
                obj = {results: results, uniqueFields: _this.uniqueFields};
                _this._setQueryresults(obj);
                _this.fire('queryExecuted',obj);
            }
            else {
                obj = {results: [], uniqueFields: []};
                _this._setQueryresults(obj);
                _this.fire('queryExecuted',obj);
                _this.fire('queryMsgUpdated',{id:_this.id ? _this.id : null, message: 'No data in the "' + _this.collection +'" collection.','type':'error'});
            }
        }
        function determineFields(results) {
            var dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|1\d|2\d|3[0-1])T(0[1-9]|1\d|2[0-3]):(0\d|1\d|2\d|3\d|4\d|5\d):(0\d|1\d|2\d|3\d|4\d|5\d).\d\d\dZ$/;
            var uniqueFields=[];
            var filters=[];
            var metricsIgnoredFields = ['account','realm'];
            for (var i=0; i<results.length; i++) {
                var keys = Object.keys(results[i]);
                for (var j=0; j<keys.length; j++) {
                    if (uniqueFields.indexOf(keys[j]) === -1) {
                        if (_this.service === 'metrics' && metricsIgnoredFields.indexOf(keys[j]) > -1) {
                            continue;
                        }
                        determineType(keys[j],results[i][keys[j]]);
                    }
                }
            }

            if (filters.length > 0 && uniqueFields.length > 0) {
                _this.uniqueFields = uniqueFields.sort(_this._sortAlphabetically);
                if (destroy) {
                    $(_this.$.editor).queryBuilder('destroy');
                }
                $(_this.$.editor).queryBuilder({
                    filters: filters.sort(_this._sortAlphabetically),
                    icons: {
                        add_group: 'fa fa-plus-square',
                        add_rule: 'fa fa-plus-circle',
                        remove_group: 'fa fa-minus-square',
                        remove_rule: 'fa fa-minus-circle',
                        error: 'fa fa-exclamation-triangle'
                    }
                });
                _this._setupListeners();
            }
            function determineType(key,val) {
                var type = $.type(val);
                var operators=[];
                var input='';
                var values={};
                var default_value='';
                var isArray=false;

                //We need to support querying values inside arrays so we need to know what type of
                //values the array holds. To determine this we will use the first item in the array.
                if (type === 'array') {
                    operators=['in', 'not_in', 'is_null', 'is_not_null'];
                    val = val[0];
                    type = $.type(val);
                    isArray=true;
                }

                if (type === 'string') {
                    if (!dateRegex.test(val) && !isArray) { //don't overwrite array operators
                        operators=['equal','not_equal','begins_with','not_begins_with','contains','not_contains',
                            'ends_with','not_ends_with','is_empty','is_not_empty','is_null','is_not_null'];
                    }
                    else { type = 'datetime'; }
                }
                else if (type === 'number') {
                    type = val%1 === 0 ? 'integer' : 'double';
                }
                else if (type === 'boolean') {
                    input='select';
                    values={'true':'true','false':'false'};
                    default_value = 'true';
                }
                else if (type === 'object') {
                    for (var prop in val) {
                        if (!val.hasOwnProperty(prop)) {
                            continue;
                        }
                        var newItemKey = key+'.'+prop;
                        if (uniqueFields.indexOf(newItemKey) === -1) {
                            determineType(newItemKey,val[prop]);
                        }
                    }
                    return;
                }
                else if (type === 'array') { type = 'string'; } //TODO - Need to support querying an arrays of arrays
                else { type = 'string'; }

                uniqueFields.push(key);
                var filter = {
                    id: key,
                    type: type,
                    optgroup: _this.service
                };
                if (operators.length > 0) { filter.operators=operators; }
                if (input.length > 0) { filter.input = input; }
                if (Object.keys(values).length > 0) { filter.values = values; }
                if (default_value.toString().length > 0) { filter.default_value = default_value; }
                filters.push(filter);
            }
        }
    },
    _setupListeners: function() {
        var _this = this;
        $(this.$.editor).on('afterCreateRuleInput.queryBuilder', function(e, rule) {
            var inputs = $(Polymer.dom(_this.root).querySelector('#'+rule.id + ' .rule-value-container')).children();
            if (inputs) {
                $(inputs).bind("change",function() {
                    _this._refreshQuery();
                });
            }
        });

        $(this.$.editor).on('afterUpdateRuleOperator.queryBuilder', function(e, rule) {
            if (!_this.skipListeners) {
                _this._refreshQuery();
            }
        });
    },
    _sortAlphabetically: function(a,b) {
        a = (a.id ? a.id : a).toLowerCase();
        b = (b.id ? b.id : b).toLowerCase();
        if (a < b) { return -1; }
        else if (a > b) { return  1; }
        return 0;
    }
});