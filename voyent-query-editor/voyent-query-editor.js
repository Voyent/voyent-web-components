var Voyent = Voyent || {};

Voyent.QueryEditor = Polymer({
    is: "voyent-query-editor",

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
        this.service = service || 'event';
        this.collection = collection || 'events';
        this.fields = fields || {};
        this.options = options || {};
        this.queryurltarget = queryurltarget || null;
        this.reloadEditor();
    },

    properties: {
        /**
         * Defines the Voyent realm to build queries for.
         * @default voyent.io.auth.getLastKnownRealm()
         */
        realm: { type: String },
        /**
         * Defines the Voyent account to build queries for.
         * @default voyent.io.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * The service that you would like to build the query for. Currently `docs`, `locate`, `event` and `authadmin` are supported.
         */
        service: { type: String, value: 'event', observer: '_updateQueriesList' },
        /**
         * The collection that you would like to build the query for. This initial dataset determines the fields available in the editor.
         * Some services may only support one collection (eg. event, authadmin, etc..), in this case the collection will change automatically with the service.
         */
        collection: { type: String, value: 'events', observer: '_updateQueriesList' },
        /**
         * Specifies the raw mongo query that should be loaded into the editor.
         *
         * Example:
         *
         *      {"$and":[{"state":{"$ne":null}}]}
         */
        query: { type: Object, value: {}, observer: '_queryChanged' },
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
        querylistresults: { type: String, notify: true, readOnly: true },
        /**
         * Current query object that is built.
         */
        currentquery: { type: Object, notify: true, readOnly: true },
        /**
         * Last query object that was executed by our editor.
         */
        lastquery: { type: Object, notify: true, readOnly: true }
    },

    /**
     * Fired after the query editor is completely initialized.
     *
     * @event queryEditorInitialized
     */

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

    //we use ready instead of created so that the properties get initialized first
    ready: function() {
        var _this = this;

        //generate a unique ID for the editor div so we can render
        //multiple query editors on the same page without conflicts
        this._uniqueId = 'a'+(Date.now()+Math.floor(Math.random() * Date.now()));

        //use scopeSubtree to apply styles to elements included by third-party libraries
        this.scopeSubtree(Polymer.dom(this.root).querySelector('#'+this._uniqueId), true);

        var jqueryBuilderURL = this.resolveUrl('./jquery-builder-import.html');
        var jqueryURL = this.resolveUrl('../jquery-import/jquery-import.html');
        if (!('jQuery' in window)) {
            //load missing jQuery dependency
            this.importHref(jqueryURL, function(e) {
                document.head.appendChild(document.importNode(e.target.import.body,true));
                onAfterjQueryLoaded();
            }, function(err) {
                _this.fire('message-error', 'voyent-query-editor: error loading jquery ' + err);
                console.error('voyent-query-editor: error loading jquery',err);
            });
        }
        else { onAfterjQueryLoaded(); }

        function onAfterjQueryLoaded() {
            //load missing jQuery-QueryBuilder dependency
            if (!$.fn.queryBuilder) {
                _this.importHref(jqueryBuilderURL, function(e) {
                    document.head.appendChild(document.importNode(e.target.import.body,true));
                    initialize();
                }, function(err) {
                    _this.fire('message-error', 'voyent-query-editor: error loading jquery builder ' + err);
                    console.error('voyent-query-editor: error loading jquery builder',err);
                });
            }
            else { initialize(); }
        }

        function initialize() {
            if (!_this.realm) {
                _this.realm = voyent.io.auth.getLastKnownRealm();
            }
            if (!_this.account) {
                _this.account = voyent.io.auth.getLastKnownAccount();
            }
            _this.reloadEditor();
            _this.fetchQueryList();
        }

        //make sure we initialize any queries that are defined in the query property
        this.addEventListener('queryEditorInitialized', function(e) {
            this.setEditorFromMongo(this._parseQueryProperty(this.query));
        });
    },

    /**
     * Execute the current query.
     */
    runQuery: function() {
        var query = $(Polymer.dom(this.root).querySelector('#'+this._uniqueId)).queryBuilder('getMongo');
        if (Object.keys(query).length !== 0) {
            this._setCurrentquery(query);
            this._processTimeFields(query,true);
            this._queryService(query);
        }
    },

    /**
     * Creates or updates a query using the provided parameters.
     * If there is an active query in the editor then the ID parameter will be ignored and the query will be updated. Otherwise a new query is created using the provided or server generated ID.
     * @param id - The query ID, ignored if doing an update
     * @param description - Optional query description
     */
    saveQuery: function(id,description) {
        var query = this._buildQuery(id,description,false);
        if (query !== null) {
            this._createQuery(query);
        }
    },

    /**
     *  Similar to `saveQuery` but this function will prompt for the query id and does not provide a way to set the description.
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
        var query = this._buildQuery(queryId,null,false);
        if (query !== null) {
            this._createQuery(query);
        }
    },

    /**
     * Clones the currently active query using the provided parameters.
     * @param id - The query ID, generated by the service if not provided
     * @param description - Optional query description, if not provided then the existing value, if any, will be cloned
     */
    cloneQuery: function(id,description) {
        if (!this.activeQuery) {
            this.fire('queryMsgUpdated',{id:this.id ? this.id : null, message: 'No query to clone.','type':'error'});
            return;
        }
        var query = this._buildQuery(id,description,true);
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
        var query = this._buildQuery(queryId,null,true);
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
        this._deleteQuery(this.activeQuery._id);
    },

    /**
     * Clears the query editor and restores the `fields` and `options` attributes to their original values.
     */
    resetEditor: function() {
        try {
            var editor = $(Polymer.dom(this.root).querySelector('#'+this._uniqueId));
            if (!editor || !editor.queryBuilder) {
                return;
            }
            editor.queryBuilder('reset');
        }
        catch(e) {
            //the reset call may throw errors if the query editor has no filter list yet
            //but if there is no filter list then there is nothing to reset so ignore it
        }
        this.options = JSON.parse(this.getAttribute('options')) || {};
        this.fields = JSON.parse(this.getAttribute('fields')) || {};
        this.activeQuery = null;
        this._setQueryHeader(null);
        this._updateQueryURL();
        this._queryService({});
        this._setCurrentquery({});
    },

    /**
     * Retrieves a list of all the queries in the current realm.
     */
    fetchQueryList: function() {
        if (!voyent.io.auth.isLoggedIn() || !this.realm || !this.account || !this.service || !this.collection) {
            return;
        }
        this._getAllQueries();
    },

    /**
     * Populate the editor from an existing query.
     * @param query - The query in object form.
     */
    setEditorFromMongo: function(query) {
        //since the format of queries has changed over time we have these
        //checks in here to be sure we can load queries of all formats.
        //This is also a away to convert old queries since if the query is
        //updated through the editor then it will be saved in the new format
        var theQuery = {};
        var theOptions = {};
        var theFields = {};
        if (!query) {
            return;
        }
        else if (!query.query) {
            //comes in as a basic query and nothing else
            theQuery = query;
        }
        else if (!query.query.find) {
            //comes in as the old format
            theQuery = query.query;
            theOptions = query.options || {};
            theFields = query.fields || {};
        }
        else {
            //comes in as the new format
            theQuery = query.query.find;
            theOptions = query.query.options || {};
            theFields = query.query.fields || {};
        }
        this.skipListeners = true;
        this.options = theOptions;
        this.fields = theFields;
        try {
            if (Object.keys(theQuery).length === 0) {
                $(Polymer.dom(this.root).querySelector('#'+this._uniqueId)).queryBuilder('reset');
            }
            else {
                this._processTimeFields(theQuery,false);
                $(Polymer.dom(this.root).querySelector('#'+this._uniqueId)).queryBuilder('setRulesFromMongo',theQuery);
            }
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
        this._updateQueryURL(theQuery);
        this.skipListeners = false;
    },

    /**
     * Completely destroy and reinitialize the editor.
     */
    reloadEditor: function() {
        if (!voyent.io.auth.isLoggedIn() || !this.realm || !this.account || !this.service || !this.collection) {
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
        var query = $(Polymer.dom(this.root).querySelector('#'+this._uniqueId)).queryBuilder('getMongo');
        if (Object.keys(query).length > 0) {
            this._setCurrentquery(query);
            return true;
        }
        return false;
    },


    //******************PRIVATE API******************

    /**
     * Create a query in the service, which basically means to save
     *
     * @param query to create
     */
    _createQuery: function(query) {
        var _this = this;
        var params = {
            account: this.account,
            realm: this.realm,
            query: query
        };
        var func = this.allQueries.indexOf(query._id) > -1 ? 'updateQuery' : 'createQuery';
        if (query._id) {
            params.id = query._id;
            delete query._id;
        }
        //create/update the query
        voyent.io.query[func](params).then(function(uri) {
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
            _this.fire('message-error', 'createQuery caught an error: ' + error);
            console.error('createQuery caught an error:',error);
        });
    },

    /**
     * Delete a query based on the passed queryId
     * This will update the state of the query editor to reflect the removal
     *
     * @param queryId
     */
    _deleteQuery: function(queryId) {
        var _this = this;
        voyent.io.query.deleteQuery({
            id:queryId,
            account: this.account,
            realm: this.realm
        }).then(function() {
            _this.fire('queryMsgUpdated',{id:_this.id ? _this.id : null, message: 'Query "'+queryId+'" deleted','type':'info'});
            _this.resetEditor();
            _this.fetchQueryList();
        }).catch(function(error){
            _this.fire('message-error', 'deleteQuery caught an error: ' + error);
            console.error('deleteQuery caught an error:',error);
        });
    },

    /**
     * Retrieve all queries from the service and filter accordingly for service/collection
     */
    _getAllQueries: function() {
        var _this = this;
        voyent.io.query.findQueries({
            account:this.account,
            realm: this.realm
        }).then(function(results) {
            //store the names of all the queries so we can provide
            //validation messages indicating if a query name exists
            _this.allQueries = results.map(function(query) {
                return query._id;
            });
            //filter the query results so that we only show queries for the
            //currently selected service / collection combination, if available
            var filteredResults = results.filter(function(obj) {
                return ((!obj.properties || !obj.properties.service || !obj.properties.collection) ||
                (obj.properties.service === _this.service &&
                obj.properties.collection === _this.collection))
            });
            _this._setQuerylistresults(filteredResults);
            _this.fire('queriesRetrieved',{results: filteredResults});
        }).catch(function(error){
            _this.fire('message-error', 'fetchQueryList caught an error: ' + error);
            console.error('fetchQueryList caught an error:',error);
        });
    },

    /**
     * Build a query object based on the passed parameters
     * This will ensure the proper format of our resulting query
     *
     * @param id
     * @param description
     * @param isClone
     */
    _buildQuery: function(id,description,isClone) {
        var query = $(Polymer.dom(this.root).querySelector('#'+this._uniqueId)).queryBuilder('getMongo');
        if (Object.keys(query).length === 0) {
            return null;
        }
        this._setCurrentquery(query);
        this._processTimeFields(query,true);
        var queryToPost = {
            "query": {
                "find": query,
                "fields": this.getAttribute('fields') ? this.getAttribute('fields') : {},
                "options": this.getAttribute('options') ? this.getAttribute('options') : {}
            },
            "properties":{
                "type":"find",
                "service":this.service,
                "collection":this.collection
            }
        };
        if (typeof queryToPost.query.fields === 'string') {
            queryToPost.query.fields = JSON.parse(queryToPost.query.fields);
        }
        if (typeof queryToPost.query.options === 'string') {
            queryToPost.query.options = JSON.parse(queryToPost.query.options);
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
            if (this.activeQuery.properties && this.activeQuery.properties.type &&
                this.activeQuery.properties.service && this.activeQuery.properties.collection) {
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

    /**
     * Refresh our query object, time fields, and URL based on the underlying query editor
     */
    _refreshQuery: function() {
        var query = $(Polymer.dom(this.root).querySelector('#'+this._uniqueId)).queryBuilder('getMongo');
        if (Object.keys(query).length !== 0) {
            this._setCurrentquery(query);
            this._processTimeFields(query,true);
            this._updateQueryURL(query);
        }
    },

    /**
     * Process any time fields in the passed query
     * This means converting to or from UTC to local time
     * We want to ensure a consistent UTC time for service interaction, and local time for UI readability
     *
     * @param query
     * @param toUTC
     */
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

    /**
     * Format the passed value into a UTC ISO string
     * There is a chance the passed value is valid except for milliseconds, which we want to parse out and format as normal
     *
     * @param val
     */
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

    /**
     * Convert the passed value to local time, which generally means wrapping in a new Date object
     * This function also handles slightly incorrect values which include milliseconds. Those will be removed and the result parsed as normal
     *
     * @param val
     */
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

    /**
     * Set a header title for our query
     *
     * @param query
     */
    _setQueryHeader: function(query) {
        var container = Polymer.dom(this.root).querySelector('#'+this._uniqueId+'_group_0');
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

    /**
     * Update the query URL based on the passed query
     * This URL simulates what service interaction endpoint is used
     *
     * @param query
     */
    _updateQueryURL: function(query) {
        var queryURLTarget = this.queryurltarget;
        if (queryURLTarget && document.getElementById(queryURLTarget)) {
            var q = query ? JSON.stringify(query) : '{}';
            var params = '?access_token='+voyent.io.auth.getLastAccessToken()+'&query='+q+'&fields='+JSON.stringify(this.fields)+'&options='+JSON.stringify(this.options);
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
    /**
     * Use our query service to execute/run the passed query
     * This function will determine which service to interact with
     *
     * @param query
     * @param destroy
     */
    _queryService: function(query,destroy) {
        if (!voyent.io.auth.isLoggedIn() || !this.realm || !this.account || !this.service || !this.collection) {
            return;
        }
        var _this = this;
        var params = {
            accessToken: voyent.io.auth.getLastAccessToken(),
            account: this.account,
            realm: this.realm,
            query: query,
            fields: this.fields,
            options: this.options
        };
        var protocol = 'http://';
        var path = '/'+this.account+'/realms/'+this.realm;

        // Store our last query before we execute
        _this._setLastquery(query);
        
        switch(this.service.toLowerCase()) {
            case 'docs': case 'documents': //'documents' is here for backwards compatibility
                this.service = 'docs'; //make sure we are using 'docs' as the service name
                params.collection = this.collection;
                this.service_url = protocol+voyent.io.documentsURL+path+'/'+this.collection;
                voyent.io.documents.findDocuments(params).then(successCallback).catch(function(error){
                    _this.fire('message-error', 'findDocuments caught an error: ' + error);
                    console.error('findDocuments caught an error:',error);
                });
                break;
            case 'locate': case 'location': //'location' is here for backwards compatibility
                this.service = 'locate'; //make sure we are using 'locate' as the service name
                this.service_url = protocol+voyent.io.locateURL+path+'/'+this.collection;
                switch (this.collection.toLowerCase()) {
                    case 'locations':
                        voyent.io.location.findLocations(params).then(successCallback).catch(function(error){
                            _this.fire('message-error', 'findLocations caught an error: ' + error);
                            console.error('findLocations caught an error:',error);
                        });
                        break;
                    case 'regions':
                        voyent.io.location.findRegions(params).then(successCallback).catch(function(error){
                            _this.fire('message-error', 'findRegions caught an error: ' + error);
                            console.error('findRegions caught an error:',error);
                        });
                        break;
                    case 'poi':
                        voyent.io.location.findPOIs(params).then(successCallback).catch(function(error){
                            _this.fire('message-error', 'findPOIs caught an error: ' + error);
                            console.error('findPOIs caught an error:',error);
                        });
                        break;
                    default:
                        this.fire('queryMsgUpdated',{id:this.id ? this.id : null, message: 'Location Service Collection "' + this.collection + '" not supported.','type':'error'});
                }
                break;
            case 'event': case 'metrics': //'metrics' is here for backwards compatibility
                this.service = 'event'; //make sure we are using 'event' as the service name
                this.collection = 'events';
                this.service_url = protocol+voyent.io.metricsURL+path+'/'+this.collection;
                voyent.io.event.findEvents(params).then(successCallback).catch(function(error){
                    _this.fire('message-error', 'findEvents caught an error: ' + error);
                    console.error('findEvents caught an error:',error);
                });
                break;
            case 'authadmin':
                this.collection = 'users';
                this.service_url = protocol+voyent.io.authAdminURL+path+'/'+this.collection;
                switch (this.collection.toLowerCase()) {
                    case 'users':
                        voyent.io.admin.getRealmUsers(params).then(successCallback).catch(function(error){
                            _this.fire('message-error', 'getRealmUsers caught an error: ' + error);
                            console.error('getRealmUsers caught an error:',error);
                        });
                        break;
                    default:
                        this.fire('queryMsgUpdated',{id:this.id ? this.id : null, message: 'AuthAdmin Service Collection "' + this.collection + '" not supported.','type':'error'});
                }
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
                        //'metrics' is here for backwards compatibility
                        if ((_this.service === 'event' || _this.service === 'metrics') && metricsIgnoredFields.indexOf(keys[j]) > -1) {
                            continue;
                        }
                        determineType(keys[j],results[i][keys[j]]);
                    }
                }
            }

            if (filters.length > 0 && uniqueFields.length > 0) {
                _this.uniqueFields = uniqueFields.sort(_this._sortAlphabetically);
                if (destroy) {
                    $(Polymer.dom(_this.root).querySelector('#'+_this._uniqueId)).queryBuilder('destroy');
                }
                $(Polymer.dom(_this.root).querySelector('#'+_this._uniqueId)).queryBuilder({
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

                if (type === 'string' && !isArray) { //don't overwrite array operators
                    if (!dateRegex.test(val)) {
                        operators=['equal','not_equal','begins_with','not_begins_with','contains','not_contains',
                            'ends_with','not_ends_with','less','less_or_equal','greater','greater_or_equal',
                            'between','not_between','is_empty','is_not_empty','is_null','is_not_null'];
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
                //else if (type === 'array') {  } //TODO - Need to support querying an arrays of arrays
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

    /**
     * Setup listeners for the underlying query editor, specifically to refresh our query object
     *  after a change happens in the query editor component
     */
    _setupListeners: function() {
        var _this = this;
        $(Polymer.dom(this.root).querySelector('#'+this._uniqueId)).on('afterCreateRuleInput.queryBuilder', function(e, rule) {
            var inputs = $(Polymer.dom(_this.root).querySelector('#'+rule.id + ' .rule-value-container')).children();
            if (inputs) {
                $(inputs).bind("change",function() {
                    _this._refreshQuery();
                });
            }
        });

        $(Polymer.dom(this.root).querySelector('#'+this._uniqueId)).on('afterUpdateRuleOperator.queryBuilder', function(e, rule) {
            if (!_this.skipListeners) {
                _this._refreshQuery();
            }
        });

        this.editor = $(Polymer.dom(this.root).querySelector('#'+this._uniqueId)); //expose jQuery QueryBuilder programmatically

        //fire queryEditorInitialized event only once
        if (!this._queryEditorInitialized) {
            //and fire it after the query editor is actually visible on the page
            var checkExist = setInterval(function() {
                if (_this.$$('#'+_this._uniqueId+'_group_0')) {
                    _this._queryEditorInitialized = true;
                    _this.fire('queryEditorInitialized');
                    clearInterval(checkExist);
                }
            },10);
        }
    },

    /**
     * Sort the passed a & b ids alphabetically
     * @param a
     * @param b
     */
    _sortAlphabetically: function(a,b) {
        a = (a.id ? a.id : a).toLowerCase();
        b = (b.id ? b.id : b).toLowerCase();
        if (a < b) { return -1; }
        else if (a > b) { return  1; }
        return 0;
    },

    /**
     * Called when our query has been changed
     * If the underlying query editor has been initialized this will update it from the passed query
     *
     * @param query
     */
    _queryChanged: function(query) {
        //If the query editor is not initialized yet then don't proceed. We will call
        //setEditorFromMongo again after in the queryEditorInitialized event listener
        if (!this._queryEditorInitialized) {
            return;
        }
        this.setEditorFromMongo(this._parseQueryProperty(query));
    },

    /**
     * Attempt to parse the passed query object to determine JSON validity
     *
     * @param query
     */
    _parseQueryProperty: function(query) {
        if (!query || Object.keys(query).length === 0) {
            return null;
        }
        var parsedQuery;
        try {
            parsedQuery = JSON.parse(query);
        }
        catch (e) {
            parsedQuery = query;
        }
        return {"query":parsedQuery};
    },

    /**
     * Get all the queries when the service or collection is changed so we always have an updated
     *  query list and always show the correct queries for that service/collection combination
     */
    _updateQueriesList: function() {
        this.fetchQueryList();
        this.resetEditor();
    }
});
