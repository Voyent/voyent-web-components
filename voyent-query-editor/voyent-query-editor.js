var Voyent = Voyent || {};

Voyent.QueryEditor = Polymer({
    is: "voyent-query-editor",

    /**
     * Custom constructor to be used when creating the component via javascript (new Voyent.QueryEditor(..)).
     * If no attributes are passed to the constructor then the defaults will be used.
     * @param account
     * @param realm
     * @param service
     * @param collection
     * @param query
     * @param fields
     * @param options
     * @param showselectmenus
     */
    factoryImpl: function(account,realm,service,collection,query,fields,options,showselectmenus) {
        this.account = account || null;
        this.realm = realm || null;
        this.service = service || 'event';
        this.collection = collection || 'events';
        this.query = query || {};
        this.fields = fields || {};
        this.options = options || {};
        this.showselectmenus = !!showselectmenus;
    },

    properties: {
        /**
         * Defines the Voyent realm to build queries for.
         * @default voyent.auth.getLastKnownRealm()
         */
        realm: { type: String },
        /**
         * Defines the Voyent account to build queries for.
         * @default voyent.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * The service that you would like to build the query for. See the `collection` attribute for a complete list
         * of available services and their matching collections. If an invalid service is set then the value will be
         * reverted to the last valid one. An invalid service includes setting the service to "docs" when no collections
         * can be found.
         */
        service: { type: String, value: 'event', notify: true, observer: '_serviceChanged' },
        /**
         * The collection that you would like to build the query for. When the `service` attribute is changed this
         * attribute will be automatically set to the default collection for that service. If an invalid collection is
         * set then the value will be reverted to the last valid one.
         *
         * Service/Collection Mapping:
         * 
         *     |------------------------------------------------|
         *     | Services | Collections             | Default   |
         *     |----------|-------------------------|-----------|
         *     | action   | actions                 | actions   |
         *     | admin    | users                   | users     |
         *     | docs     | {{*}}                   | {{*[0]}}  |
         *     | event    | events                  | events    |
         *     | eventhub | handlers, recognizers   | handlers  |
         *     | locate   | locations, poi, regions | locations |
         *     |------------------------------------------------|
         */
        collection: { type: String, value: 'events', notify: true, observer: '_collectionChanged' },
        /**
         * Specify the raw mongo query or a complete query object (find type only). If loading an entire query object
         * then the `fields` and `options` attributes will also be set if they are available.
         *
         * Basic Query Example:
         *
         *      {"$and":[{"state":{"$ne":null}}]}
         *
         * Full Query Example:
         *
         *      {
         *          "query": {
         *              "find": {"$and":[{"state":{"$ne":null}}]},
         *              "fields": {"username": 1},
         *              "options": {
         *                  "limit": 3,
         *                  "sort": {
         *                      "time": -1
         *                  }
         *              }
         *          },
         *          "properties": {
         *              "title": "Find Users With State",
         *              "service": "docs",
         *              "collection": "status",
         *              "type": "find"
         *          }
         *      }
         */
        query: { type: Object, value: {}, notify: true, observer: '_queryChanged' },
        /**
         * Specify the inclusion or exclusion of fields to return in the result set.
         *
         * Example:
         *
         *      //exclude _id column
         *      {"_id":0}
         */
        fields: { type: Object, value: {}, notify: true },
        /**
         * Additional query options such as limit and sort.
         *
         * Example:
         *
         *      //sort by time (descending) + get only 100 records
         *      {"sort":{"time":-1},"limit":100}
         */
        options: { type: Object, value: {}, notify: true },
        /**
         * Specify whether the service and collection select menus should be shown at the top of the component.
         */
        showselectmenus: { type: Boolean, value: false, observer: '_showselectmenusChanged' },
        /**
         * A string representation of the object returned from the `queryExecuted` event. Use when data binding is
         * preferred over event listeners.
         */
        queryresults: { type: String, notify: true, readOnly: true },
        /**
         * A string representation of the results array returned from the `queriesRetrieved` event. Use when data
         * binding is preferred over event listeners.
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
     * Fired after a query is executed. Contains the query results and the unique fields.
     *
     * @event queryExecuted
     */

    /**
     * Fired after the query list is retrieved. Contains the list of saved queries in this realm.
     *
     * @event queriesRetrieved
     */

    //load the dependencies dynamically in the created to maximise component loading time
    created: function() {
        var _this = this;
        if (!('jQuery' in window)) {
            //load missing jQuery dependency
            var jqueryURL = this.resolveUrl('../common/imports/jquery.html');
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
                var jqueryBuilderURL = _this.resolveUrl('../common/imports/jquery-builder.html');
                _this.importHref(jqueryBuilderURL, function(e) {
                    document.head.appendChild(document.importNode(e.target.import.body,true));
                }, function(err) {
                    _this.fire('message-error', 'voyent-query-editor: error loading jquery builder ' + err);
                    console.error('voyent-query-editor: error loading jquery builder',err);
                });
            }
        }
    },

    ready: function() {
        var _this = this;
        //define the services and collection combinations and their matching voyent call
        this._serviceMappings = {
            "action": {
                "actions":"findActions"
            },
            "admin": {
                "users":"getRealmUsers"
            },
            "docs": {
                "collection":"findDocuments" //since docs can have any collection just group them into "collection"
            },
            "event": {
                "events":"findEvents"
            },
            "eventhub": {
                "handlers":"findHandlers",
                "recognizers":"findRecognizers"
            },
            "locate": {
                "locations":"findLocations",
                "poi":"findPOIs",
                "regions":"findRegions"
            }
        };
        function initialize() {
            if (!('jQuery' in window && $.fn.queryBuilder)) {
                setTimeout(initialize,10);
                return;
            }
            _this._dependenciesLoaded = true;
            if (!_this.realm) {
                _this.realm = voyent.auth.getLastKnownRealm();
            }
            if (!_this.account) {
                _this.account = voyent.auth.getLastKnownAccount();
            }
            if (!voyent.auth.isLoggedIn() || !_this.realm || !_this.account) {
                return;
            }
            _this.reloadEditor();
            _this.fetchQueryList();
            //use scopeSubtree to apply styles to elements included by third-party libraries
            _this.scopeSubtree(_this.$.queryBuilder, true);
        }
        initialize();
    },

    /**
     * Execute the current query.
     */
    runQuery: function() {
        if (!this._dependenciesLoaded) { return; }
        var query = $(this.$.queryBuilder).queryBuilder('getMongo');
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
        if (!this._dependenciesLoaded) { return; }
        var query = this._buildQuery(id,description,false);
        if (query !== null) {
            this._createQuery(query);
        }
    },

    /**
     *  Similar to `saveQuery` but this function will prompt for the query id and does not provide a way to set the description.
     */
    saveQueryWithPrompt: function() {
        if (!this._dependenciesLoaded) { return; }
        if (!this.validateQuery()) { return; }
        var queryId;
        if (!this.activeQuery) {
            queryId = window.prompt("Enter the new query name","Auto-Named");
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
        if (!this._dependenciesLoaded) { return; }
        if (!this.activeQuery) {
            this.fire('message-error', 'Unable to clone query: no query loaded');
            console.error('Unable to clone query: no query loaded');
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
        if (!this._dependenciesLoaded) { return; }
        if (!this.activeQuery) {
            this.fire('message-error', 'Unable to clone query: no query loaded');
            console.error('Unable to clone query: no query loaded');
            return;
        }
        if (!this.validateQuery()) { return; }
        var queryId;
        queryId = window.prompt("Enter the new query name","Auto-Named");
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
        if (!this._dependenciesLoaded) { return; }
        if (!this.activeQuery || !this.activeQuery._id) {
            this.fire('message-error', 'Unable to clone query: no query loaded');
            console.error('Unable to clone query: no query loaded');
            return;
        }
        this._deleteQuery(this.activeQuery._id);
    },

    /**
     * Clears the query editor and restores the `fields` and `options` attributes to their original values.
     */
    resetEditor: function() {
        if (!this._dependenciesLoaded) { return; }
        var editor = $(this.$.queryBuilder);
        if (!editor || !editor.queryBuilder) {
            return;
        }
        editor.queryBuilder('reset');
        this.options = JSON.parse(this.getAttribute('options')) || {};
        this.fields = JSON.parse(this.getAttribute('fields')) || {};
        this.activeQuery = null;
        this._setQueryHeader(null);
        this._queryService({});
        this._setCurrentquery({});
    },

    /**
     * Retrieves a list of all the queries in the current realm.
     */
    fetchQueryList: function() {
        if (!this._dependenciesLoaded) { return; }
        var _this = this;
        voyent.query.findQueries({
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
            _this.fire('message-error', 'Error in fetchQueryList: ' + error.detail);
            console.error('Error in fetchQueryList:',error);
        });
    },

    /**
     * Populate the editor from an existing query.
     * @param query - The query in object form.
     */
    setEditorFromMongo: function(query) {
        if (!this._dependenciesLoaded) { return; }
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
        else if (!query.query) { //basic query
            theQuery = query;
        }
        else if (!query.query.find) { //old format
            theQuery = query.query;
            theOptions = query.options || {};
            theFields = query.fields || {};
        }
        else { //current format
            theQuery = query.query.find;
            theOptions = query.query.options || {};
            theFields = query.query.fields || {};
        }
        this.skipListeners = true;
        this.options = theOptions;
        this.fields = theFields;
        try {
            if (Object.keys(theQuery).length === 0) {
                $(this.$.queryBuilder).queryBuilder('reset');
            }
            else {
                this._processTimeFields(theQuery,false);
                $(this.$.queryBuilder).queryBuilder('setRulesFromMongo',theQuery);
            }
            this.activeQuery = query;
            this._setQueryHeader(query);
        }
        catch (e) {
            var errorMsg = 'Unable to populate query editor: ';
            if (e.message.indexOf('Undefined filter') !== -1) {
                errorMsg = errorMsg + '"' + e.message.split('Undefined filter ').join('') + '"' + ' field does not exist in this database.';
            }
            else {
                errorMsg = errorMsg + e.message;
            }
            this.fire('message-error', errorMsg);
            console.error(errorMsg);
        }
        this.skipListeners = false;
    },

    /**
     * Completely destroy and reinitialize the editor.
     */
    reloadEditor: function() {
        if (!this._dependenciesLoaded) { return; }
        this._redetermineFields = true;
        this._queryService({});
    },

    /**
     * Test if the current query is valid.
     * @return {boolean} Indicates if the query is valid.
     */
    validateQuery: function() {
        if (!this._dependenciesLoaded) { return false; }
        var query = $(this.$.queryBuilder).queryBuilder('getMongo');
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
        voyent.query[func](params).then(function(uri) {
            var queryId = _this.activeQuery._id;
            if (uri) {
                queryId = uri.split("/").pop();
            }
            query._id = queryId;
            _this.activeQuery = query;
            _this._setQueryHeader(_this.activeQuery);
            _this.fetchQueryList();
            _this.fire('message-info', 'Successfully saved query: '+queryId);
        }).catch(function(error){
            _this.fire('message-error', 'Error in createQuery: ' + error.detail);
            console.error('Error in createQuery:',error);
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
        voyent.query.deleteQuery({
            id:queryId,
            account: this.account,
            realm: this.realm
        }).then(function() {
            _this.fire('message-info', 'Successfully deleted query: '+queryId);
            _this.resetEditor();
            _this.fetchQueryList();
        }).catch(function(error){
            _this.fire('message-error', 'Error in deleteQuery: ' + error.detail);
            console.error('Error in deleteQuery:',error);
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
        var query = $(this.$.queryBuilder).queryBuilder('getMongo');
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
                    this.fire('message-error', 'The query name "'+name+'" already exists in this realm, choose a different one');
                    console.error('The query name "'+name+'" already exists in this realm, choose a different one');
                }
                return queryExists;
            }
        }
    },

    /**
     * Refresh our query object, time fields, and URL based on the underlying query editor
     */
    _refreshQuery: function() {
        var query = $(this.$.queryBuilder).queryBuilder('getMongo');
        if (Object.keys(query).length !== 0) {
            this._setCurrentquery(query);
            this._processTimeFields(query,true);
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
                if (val.indexOf('.') !== -1) { //TODO - Need regex solution
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
        var container = Polymer.dom(this.root).querySelector('#queryBuilder'+'_group_0');
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
     * Use our query service to execute the passed query
     * This function will determine which service to interact with
     *
     * @param query
     */
    _queryService: function(query) {
        var _this = this;
        var params = {
            account: this.account,
            realm: this.realm,
            query: query,
            fields: this.fields,
            options: this.options
        };
        if (this.service === 'docs') {
            params.collection = this.collection;
        }

        // Store our last query before we execute
        this._setLastquery(query);

        var func = this._serviceMappings[this.service][this.collection] || this._serviceMappings[this.service]['collection'];
        voyent[this.service][func](params).then(function (results) {
            var obj = {};
            if (results && results.length > 0) {
                if (_this._redetermineFields) {
                    determineFields(results);
                    _this._redetermineFields = false;
                }
                obj = {results: results, uniqueFields: _this.uniqueFields};
                _this._setQueryresults(obj);
                _this.fire('queryExecuted',obj);
            }
            else {
                obj = {results: [], uniqueFields: []};
                _this._setQueryresults(obj);
                _this.fire('queryExecuted',obj);
                _this.fire('message-info', 'No data found for '+_this.service+" -> "+_this.collection);
                //if the query is empty ({}) then it means that this collection has no records
                var query = $(_this.$.queryBuilder).queryBuilder('getMongo');
                if (Object.keys(query).length === 0) {
                    $(_this.$.queryBuilder).queryBuilder('destroy');
                    $(_this.$.queryBuilder).queryBuilder({
                        filters: [{"id":" ","operators":[],"optgroup":"No data found for "+_this.service+" -> "+_this.collection}],
                        icons: {
                            add_group: 'fa fa-plus-square',
                            add_rule: 'fa fa-plus-circle',
                            remove_group: 'fa fa-minus-square',
                            remove_rule: 'fa fa-minus-circle',
                            error: 'fa fa-exclamation-triangle'
                        }
                    });
                }
            }
        }).catch(function(error) {
            _this.fire('message-error', 'Error in ' + func + ': ' + error.detail);
            console.error(func + ' caught an error:',error);
        });

        function determineFields(results) {
            var dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|1\d|2\d|3[0-1])T(0[1-9]|1\d|2[0-3]):(0\d|1\d|2\d|3\d|4\d|5\d):(0\d|1\d|2\d|3\d|4\d|5\d).\d\d\dZ$/;
            var uniqueFields=[];
            var filters=[];
            var eventsIgnoredFields = ['account','realm'];
            for (var i=0; i<results.length; i++) {
                var keys = Object.keys(results[i]);
                for (var j=0; j<keys.length; j++) {
                    if (uniqueFields.indexOf(keys[j]) === -1) {
                        if (_this.service === 'event' && eventsIgnoredFields.indexOf(keys[j]) > -1) {
                            continue;
                        }
                        determineType(keys[j],results[i][keys[j]]);
                    }
                }
            }

            if (filters.length > 0 && uniqueFields.length > 0) {
                _this.uniqueFields = uniqueFields.sort(_this._sortAlphabetically);
                $(_this.$.queryBuilder).queryBuilder('destroy');
                $(_this.$.queryBuilder).queryBuilder({
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
     * after a change happens in the query editor component
     */
    _setupListeners: function() {
        var _this = this;
        $(this.$.queryBuilder).on('afterCreateRuleInput.queryBuilder', function(e, rule) {
            var inputs = $(Polymer.dom(_this.root).querySelector('#'+rule.id + ' .rule-value-container')).children();
            if (inputs) {
                $(inputs).bind("change",function() {
                    _this._refreshQuery();
                });
            }
        });

        $(this.$.queryBuilder).on('afterUpdateRuleOperator.queryBuilder', function(e, rule) {
            if (!_this.skipListeners) {
                _this._refreshQuery();
            }
        });

        this.editor = $(this.$.queryBuilder); //expose jQuery QueryBuilder programmatically

        //make sure we initialize any queries that are defined in the query property
        this.addEventListener('queryEditorInitialized', function(e) {
            _this.setEditorFromMongo(_this._parseQueryProperty(_this.query));
        });

        //fire queryEditorInitialized event only once
        if (!this._queryEditorInitialized) {
            //and fire it after the query editor is actually visible on the page
            var checkExist = setInterval(function() {
                if (_this.$$('#queryBuilder'+'_group_0')) {
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
        return parsedQuery;
    },

    /**
     * Sets the collection based on the new service value.
     * @param service
     * @param previousService
     * @private
     */
    _serviceChanged: function(service,previousService) {
        switch(service) {
            case 'event':
                //only collection is events
                this.collection = 'events';
                this._collections = null;
                break;
            case 'docs':
                this._collections = this._documentCollections;
                if (this._collections) {
                    this.collection = this._collections[0];
                }
                else {
                    //if there are no collections then 'docs' is an invalid
                    //service choice so use the last valid service name
                    this.service = previousService;
                    this.fire('message-info', 'No docs collections found, reverting service');
                }
                break;
            case 'locate':
                //default to locations
                this.collection = 'locations';
                this._collections = ['locations','poi','regions'];
                break;
            case 'admin':
                //only collection is users
                this.collection = 'users';
                this._collections = null;
                break;
            case 'action':
                //only collection is actions
                this.collection = 'actions';
                this._collections = null;
                break;
            case 'eventhub':
                //default to handlers
                this.collection = 'handlers';
                this._collections = ['handlers','recognizers'];
                break;
            default:
                //if the service name specified is not supported then use the last valid one
                this.service = previousService;
        }
    },

    /**
     * Reloads the query editor when a valid collection is set.
     * @param collection
     * @param previousCollection
     * @private
     */
    _collectionChanged: function(collection,previousCollection) {
        //if serviceMappings is undefined it means the component hasn't loaded yet
        if (!this._serviceMappings || !this._isCollectionValid()) {
            if (previousCollection) {
                //if the service name specified is not supported then use the last valid one
                this.collection = previousCollection;
            }
            return;
        }
        if (!voyent.auth.isLoggedIn() || !this.realm || !this.account) {
            return;
        }
        this._redetermineFields = true;
        this.fetchQueryList();
        this.resetEditor();
    },

    /**
     * Validates that the collection is valid.
     * @returns {boolean}
     * @private
     */
    _isCollectionValid: function() {
        if (!this.collection) {
            return false;
        }
        return this._serviceMappings[this.service][this.collection] || this._serviceMappings[this.service]['collection'];
    },

    /**
     * Fetches the list of available document service collections.
     * @param showselectmenus
     * @private
     */
    _showselectmenusChanged: function(showselectmenus) {
        //fetch the list of document collections when this attribute is toggled
        if (showselectmenus) {
            this._getDocumentCollections();
        }
    },

    /**
     * Returns the list of services available to query.
     * @returns {Array}
     * @private
     */
    _getServices: function() {
        return Object.keys(this._serviceMappings);
    },

    /**
     * Capitalizes the first letter of the passed string.
     * @param word
     * @returns {string}
     * @private
     */
    _capitalize: function(word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
    },

    /**
     * Returns the dynamic class list of the service select menu (when showselectmenus is true).
     * @param service
     * @returns {string}
     * @private
     */
    _getClass: function(service) {
        var servicesWithCollections = ['locate','docs','eventhub'];
        return servicesWithCollections.indexOf(service) > -1 ? 'small floatLeft' : 'large floatLeft';
    },

    /**
     * Fetches the list of available document service collections.
     * @private
     */
    _getDocumentCollections: function() {
        var _this = this;
        //get a list of available document collections and store it for later use
        voyent.docs.getCollections().then(function (collections) {
            _this._documentCollections = collections && collections.length ? collections : null;
        }).catch(function(error) {
            _this.fire('message-error', 'Error getting available document service collections: ' + error.detail);
            console.error('Error getting available document service collections:',error);
        });
    }
});