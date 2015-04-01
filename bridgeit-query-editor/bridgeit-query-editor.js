var _qEditor;

Polymer({

    /**
     * Fired after a query is executed, this occurs on the initial load and when calling runQuery(), resetEditor() or reloadEditor(). Contains the query results and the unique fields.
     *
     * @event queryExecuted
     */

    /**
     * Fired after the query list is retrieved, this occurs on the initial load and when calling fetchQueryList(), saveQuery(), cloneQuery(), deleteQuery(). Contains the list of saved queries in this realm.
     *
     * @event queriesRetrieved
     */

    /**
     * Fired whenever there is a message for an action that was triggered.
     *
     * @event queryMsgUpdated
     */

    /**
     * Required to authenticate with BridgeIt.
     *
     * @attribute accessToken
     * @type string
     * @default bridgeit.io.auth.getLastAccessToken()
     */
    accessToken: bridgeit.io.auth.getLastAccessToken(),

    /**
     * Defines the BridgeIt realm to build queries for.
     *
     * @attribute realm
     * @type string
     * @default bridgeit.io.auth.getLastKnownRealm()
     */
    realm: bridgeit.io.auth.getLastKnownRealm(),

    /**
     * Defines the BridgeIt account of the realm.
     *
     * @attribute account
     * @type string
     * @default bridgeit.io.auth.getLastKnownAccount()
     */
    account: bridgeit.io.auth.getLastKnownAccount(),

    /** The service that you would like to build the query for. Currently only 'documents' and 'location' are supported.
     *
     * @attribute service
     * @type string
     * @default 'documents'
     */
    service: 'documents',

    /** The collection that you would like to build the query for. This initial data within this collection determines what fields are available in the editor. If service is 'location' then the available collections are 'locations', 'regions', 'pois' and 'monitors'.
     *
     * @attribute collection
     * @type string
     * @default 'documents'
     */
    collection: 'documents',

    /** Specify the inclusion or exclusion of fields to return in the result set.
     *
     * @attribute fields
     * @type object
     * @default {}
     */
    fields: {},

    /** Additional query options such as limit and sort.
     *
     * @attribute options
     * @type object
     * @default {}
     */
    options: {},

    /** Element ID of where the GET URL of the query will be displayed as the query is built. Supports input and non-input elements.
     *
     * @attribute queryURLTarget
     * @type string
     * @default null
     */
    queryURLTarget: null,

    /**
     * An output attribute that updates when the `queryExecuted` event fires. A string representation of the object returned from the event. Use when data binding is preferred over events.
     * @attribute queryResults
     * @type string
     * @default ''
     */

    /**
     * An output attribute that updates when the `queriesRetrieved` event fires. A string representation of the results array returned from the event. Use when data binding is preferred over events.
     * @attribute queryListResults
     * @type string
     * @default ''
     */

    publish: {
        queryResults: {
            value: '',
            reflect: true
        },
        queryListResults: {
            value: '',
            reflect: true
        }
    },

    ready: function() {
        _qEditor = this;
        _qEditor.reloadEditor();
        _qEditor.fetchQueryList();
    },

    /**
     * @method runQuery
     * Execute the current query.
     */
    runQuery: function() {
        var query = $(_qEditor.shadowRoot.querySelector('#editor')).queryBuilder('getMongo');
        if (Object.keys(query).length !== 0) {
            _qEditor._queryService(query);
        }
    },

    /**
     * @method saveQuery
     * Creates or updates a query.
     * If there is an active query in the editor then the ID parameter will be ignored and the query will be updated. Otherwise a new query is created using the provided or server generated ID.
     * @param id - The query ID, ignored if doing an update
     * @param description - Optional query description
     * @param services - Optional services array
     */
    saveQuery: function(id,description,services) {
        var query = _qEditor._buildQuery(id,description,services,false);
        if (query !== null) {
            _qEditor._createQuery(query);
        }
    },

    /**
     * @method cloneQuery
     * Clones the currently active query.
     * @param id - The query ID, generated by the service if not provided
     * @param description - Optional query description, if not provided then the existing value, if any, will be cloned
     * @param services - Optional services array, if not provided then the existing value, if any, will be cloned
     */
    cloneQuery: function(id,description,services) {
        if (!_qEditor.activeQuery) {
            _qEditor.fire('queryMsgUpdated',{id:_qEditor.id ? _qEditor.id : null, message: 'No query to clone.'});
            return;
        }
        var query = _qEditor._buildQuery(id,description,services,true);
        if (query !== null) {
            _qEditor._createQuery(query);
        }
    },

    /**
     * @method deleteQuery
     * Deletes the currently active query.
     */
    deleteQuery: function() {
        if (!_qEditor.activeQuery || !this.activeQuery._id) {
            _qEditor.fire('queryMsgUpdated',{id:_qEditor.id ? _qEditor.id : null, message: 'No query to delete.'});
            return;
        }
        _qEditor._deleteQuery();
    },

    /**
     * @method resetEditor
     * Clears the query editor.
     */
    resetEditor: function() {
        $(_qEditor.shadowRoot.querySelector('#editor')).queryBuilder('reset');
        _qEditor.options = JSON.parse(_qEditor.getAttribute('options') ? _qEditor.getAttribute('options') : '{}');
        _qEditor.fields = JSON.parse(_qEditor.getAttribute('fields') ? _qEditor.getAttribute('fields') : '{}');
        _qEditor.activeQuery = null;
        _qEditor._setQueryHeader(null);
        _qEditor._queryService({});
        _qEditor._updateQueryURL();
    },

    /**
     * @method fetchQueryList
     * Retrieves a list of akk the queries in the current realm.
     */
    fetchQueryList: function() {
        if (!_qEditor.accessToken || !_qEditor.realm || !_qEditor.account || !_qEditor.service || !_qEditor.collection) {
            return;
        }
        _qEditor._getAllQueries();
    },

    /**
     * Populate the editor from an existing query.
     * @param query
     */
    setEditorFromMongo: function(query) {
        _qEditor.skipListeners = true;
        _qEditor.options = query.options ? query.options : {};
        _qEditor.fields = query.fields ? query.fields : {};
        try {
            $(_qEditor.shadowRoot.querySelector('#editor')).queryBuilder('setRulesFromMongo',query.query);
            _qEditor.activeQuery = query;
            _qEditor._setQueryHeader(query);
        }
        catch (e) {
            var errorMsg = 'Unable to populate query editor. ';
            if (e.message.indexOf('Undefined filter') !== -1) {
                errorMsg = errorMsg + '"' + e.message.split('Undefined filter: ').join('') + '"' + ' field does not exist in this database.';
            }
            else {
                errorMsg = errorMsg + e.message;
            }
            _qEditor.fire('queryMsgUpdated',{id:_qEditor.id ? _qEditor.id : null, message: errorMsg});
        }
        _qEditor._updateQueryURL(query.query);
        _qEditor.skipListeners = false;
    },

    /**
     * Completely destroy and reinitialize the editor.
     */
    reloadEditor: function() {
        if (!_qEditor.accessToken || !_qEditor.realm || !_qEditor.account || !_qEditor.service || !_qEditor.collection) {
            return;
        }
        $(_qEditor.shadowRoot.querySelector('#editor')).queryBuilder('destroy');
        _qEditor._queryService({},true);
        _qEditor._updateQueryURL();
    },


    _createQuery: function(query) {
        bridgeit.io.query.createQuery({
            accessToken: _qEditor.accessToken,
            account: _qEditor.account,
            realm: _qEditor.realm,
            query: query
        }).then(function(uri) {
            var queryId = uri.split("/").pop();
            _qEditor.activeQuery._id = queryId;
            _qEditor.fire('queryMsgUpdated',{id:_qEditor.id ? _qEditor.id : null, message: 'Query "'+queryId+'" saved'});
            _qEditor._setQueryHeader(_qEditor.activeQuery);
            _qEditor.fetchQueryList();
        }).catch(function(error){
            console.log('createQuery caught an error: ' + error);
        });
    },
    _deleteQuery: function() {
        bridgeit.io.query.deleteQuery({
            id:_qEditor.activeQuery._id,
            accessToken: _qEditor.accessToken,
            account: _qEditor.account,
            realm: _qEditor.realm
        }).then(function() {
            _qEditor.fire('queryMsgUpdated',{id:_qEditor.id ? _qEditor.id : null, message: 'Query "'+_qEditor.activeQuery._id+'" deleted'});
            _qEditor.resetEditor();
            _qEditor.fetchQueryList();
        }).catch(function(error){
            console.log('deleteQuery caught an error: ' + error);
        });
    },
    _getAllQueries: function() {
        bridgeit.io.query.findQueries({
            accessToken:  _qEditor.accessToken,
            account:_qEditor.account,
            realm: _qEditor.realm
        }).then(function(results) {
            _qEditor.allQueries = results;
            _qEditor.queryListResults = JSON.stringify(results);
            _qEditor.fire('queriesRetrieved',{results: results});
        }).catch(function(error){
            console.log('fetchQueryList caught an error: ' + error);
        });
    },
    _buildQuery: function(id,description,services,isClone) {
        var query = $(_qEditor.shadowRoot.querySelector('#editor')).queryBuilder('getMongo');
        if (Object.keys(query).length === 0) {
            return null;
        }
        var queryToPost = {
            "query": query,
            "fields": JSON.parse(_qEditor.getAttribute('fields') ? _qEditor.getAttribute('fields') : '{}'),
            "options": JSON.parse(_qEditor.getAttribute('options') ? _qEditor.getAttribute('options') : '{}'),
            "properties":{}
        };
        if (id && id.toString().length > 0) {
            queryToPost._id = id;
        }
        if ((_qEditor.activeQuery && isClone) || !_qEditor.activeQuery) {
            if (checkQueryName(queryToPost._id)) {
                return null;
            }
        }

        if (_qEditor.activeQuery) {
            if (!isClone) {
                queryToPost._id = _qEditor.activeQuery._id;
            }
            if (_qEditor.activeQuery.properties) {
                queryToPost.properties = _qEditor.activeQuery.properties;
            }
        }
        else {
            _qEditor.activeQuery = queryToPost; //set the activeQuery without the ID, ID wil be added in the save callback
        }


        if (description && jQuery.type(description) == 'string' && description.trim().length > 0) {
            queryToPost.properties.description = description;
        }
        if (services && jQuery.type(services) == 'array' && services.length > 0) {
            queryToPost.properties.services = services;
        }
        if (Object.keys(queryToPost.properties).length === 0) {
            delete queryToPost.properties;
        }
        return queryToPost;

        function checkQueryName(name) {
            var allQueries = _qEditor.allQueries;
            if (allQueries) {
                var queryExists=false;
                if (!name) {
                    return queryExists;
                }
                for (var i=0; i<allQueries.length; i++) {
                    if (allQueries[i]._id === name) {
                        queryExists=true;
                    }
                }
                if (queryExists) {
                    _qEditor.fire('queryMsgUpdated',{id:_qEditor.id ? _qEditor.id : null, message: 'The query name "'+name+'" already exists in this realm, please choose a different one.'});
                }
                return queryExists;
            }
        }
    },
    _refreshQuery: function() {
        var query = $(_qEditor.shadowRoot.querySelector('#editor')).queryBuilder('getMongo');
        if (Object.keys(query).length !== 0) {
            _qEditor._updateQueryURL(query);
        }
    },
    _setQueryHeader: function(query) {
        var container = _qEditor.shadowRoot.querySelector('#editor_group_0');
        if (query === null) {
            if (_qEditor.shadowRoot.querySelector('#queryTitle') !== null) {
                container.removeChild(_qEditor.shadowRoot.querySelector('#queryTitle'));
            }
            return;
        }
        var div;
        if (_qEditor.shadowRoot.querySelector('#queryTitle') === null) {
            div = document.createElement("div");
            div.id='queryTitle';
            div.className = 'activeQuery';
            div.innerHTML = query._id;
            container.insertBefore(div, container.firstChild);
        }
        else {
            div = _qEditor.shadowRoot.querySelector('#queryTitle');
            div.innerHTML = query._id;
        }
        if (query.properties && query.properties.description) {
            div.innerHTML = div.innerHTML+'<br><span>'+query.properties.description+'</span>';
        }
    },
    _updateQueryURL: function(query) {
        var queryURLTarget = _qEditor.queryURLTarget;
        if (document.getElementById(queryURLTarget)) {
            var q = query ? JSON.stringify(query) : '{}';
            var params = '?access_token='+_qEditor.accessToken+'&query='+q+'&fields='+JSON.stringify(_qEditor.fields)+'&options='+JSON.stringify(_qEditor.options);
            var queryURL = _qEditor.service_url+params;
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
    _queryService: function(query,genFields) {
        var params = {
            accessToken: _qEditor.accessToken,
            account: _qEditor.account,
            realm: _qEditor.realm,
            query: query,
            fields: _qEditor.fields,
            options: _qEditor.options
        };

        if (_qEditor.service.toLowerCase() === 'documents') {
            params.collection = _qEditor.collection;
            _qEditor.service_url = 'http://'+bridgeit.io.documentsURL+'/'+_qEditor.account+'/realms/'+_qEditor.realm+'/'+_qEditor.collection;
            bridgeit.io.documents.findDocuments(params).then(successCallback).catch(function(error){
                console.log('findDocuments caught an error: ' + error);
            });
        }
        else if (_qEditor.service.toLowerCase() === 'location') {
            switch (_qEditor.collection.toLowerCase()) {
                case 'locations':
                    bridgeit.io.location.findLocations(params).then(successCallback).catch(function(error){
                        console.log('findLocations caught an error: ' + error);
                    });
                    break;
                case 'regions':
                    bridgeit.io.location.findRegions(params).then(successCallback).catch(function(error){
                        console.log('findRegions caught an error: ' + error);
                    });
                    break;
                case 'pois':
                    bridgeit.io.location.findPOIs(params).then(successCallback).catch(function(error){
                        console.log('findPOIs caught an error: ' + error);
                    });
                    break;
                case 'monitors':
                    bridgeit.io.location.findMonitors(params).then(successCallback).catch(function(error){
                        console.log('findMonitors caught an error: ' + error);
                    });
                    break;
                default:
                    _qEditor.fire('queryMsgUpdated',{id:_qEditor.id ? _qEditor.id : null, message: 'Location Service Collection "' + _qEditor.collection + '" not supported.'});
            }
            _qEditor.service_url = 'http://'+bridgeit.io.locateURL+'/'+_qEditor.account+'/realms/'+_qEditor.realm+'/'+_qEditor.collection;
        }
        else {
            _qEditor.fire('queryMsgUpdated',{id:_qEditor.id ? _qEditor.id : null, message: 'Service "' + _qEditor.service + '" not supported.'});
            return;
        }
        function successCallback(results) {
            var obj = {};
            if( results && results.length > 0) {
                if (genFields) {
                    determineFields(results);
                }
                obj = {results: results, uniqueFields: _qEditor.uniqueFields};
                _qEditor.queryResults = JSON.stringify(obj);
                _qEditor.fire('queryExecuted',obj);
            }
            else {
                obj = {results: {}, uniqueFields: []};
                _qEditor.queryResults = JSON.stringify(obj);
                _qEditor.fire('queryExecuted',obj);
                _qEditor.fire('queryMsgUpdated',{id:_qEditor.id ? _qEditor.id : null, message: 'No data in the "' + _qEditor.collection +'" collection.'});
            }
        }
        function determineFields(results) {
            var dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|1\d|2\d|3[0-1])T(0[1-9]|1\d|2[0-3]):(0\d|1\d|2\d|3\d|4\d|5\d):(0\d|1\d|2\d|3\d|4\d|5\d).\d\d\dZ$/;
            var uniqueFields=[];
            var filters=[];
            for (var i=0; i<results.length; i++) {
                var keys = Object.keys(results[i]);
                for (var j=0; j<keys.length; j++) {
                    if (uniqueFields.indexOf(keys[j]) === -1) {
                        uniqueFields.push(keys[j]);
                        var val = results[i][keys[j]];
                        var type = jQuery.type(val);
                        var operators=[];
                        var input='';
                        var values={};
                        var plugin='';
                        var pluginConfig={};
                        if (type === 'string') {
                            if (!dateRegex.test(val)) {
                                operators=['equal','not_equal','begins_with','not_begins_with','contains','not_contains',
                                    'ends_with','not_ends_with','is_empty','is_not_empty','is_null','is_not_null'];
                            }
                            else {
                                type = 'datetime';
                            }
                        }
                        else if (type === 'number') {
                            if (val%1 === 0) {
                                type = 'integer';
                            }
                            else {
                                type = 'double';
                            }
                        }
                        else if (type === 'boolean') {
                            input='select';
                            values={'true':'true','false':'false'};
                        }
                        else if (type === 'array') {
                            operators=['in', 'not_in', 'is_null', 'is_not_null'];
                        }

                        if ((type !== 'string' && type !== 'integer' &&
                            type !== 'double' && type !== 'boolean' &&
                            type !== 'datetime') && type !== 'date' &&
                            type !== 'time') {
                            type = 'string';
                        }
                        var filter = {
                            id: keys[j],
                            type: type,
                            optgroup: _qEditor.service,
                            onAfterCreateRuleInput: function ($rule, filter) {
                                var valueContainer = $(_qEditor.shadowRoot.querySelector('#'+$rule[0].id + ' .rule-value-container'));
                                valueContainer[0].style.display='inline-block';
                                var inputs = valueContainer.children();
                                if (inputs) {
                                    if (!inputs.val()) {
                                        inputs.val('0');
                                        if (filter.type === 'double') {
                                            inputs.val('0.0');
                                        }
                                    }
                                    $(inputs).bind("keyup",function() {
                                        _qEditor._refreshQuery();
                                    });
                                }
                                if (!_qEditor.skipListeners) {
                                    _qEditor._refreshQuery();
                                }
                            },
                            onAfterChangeOperator: function ($rule, filter, operator) {
                                if (!_qEditor.skipListeners) {
                                    _qEditor._refreshQuery();
                                }
                            }
                        };
                        if (operators.length !== 0) {
                            filter.operators=operators;
                        }
                        if (input.length !== 0) {
                            filter.input = input;
                        }
                        if (Object.keys(values).length !== 0) {
                            filter.values = values;
                        }
                        if (plugin.length > 0) {
                            filter.plugin = plugin;
                        }
                        if (Object.keys(pluginConfig).length !== 0) {
                            filter.plugin_config = pluginConfig;
                        }
                        filters.push(filter);
                    }
                }
            }
            _qEditor.uniqueFields = uniqueFields;
            $(_qEditor.shadowRoot.querySelector('#editor')).queryBuilder({
                filters: filters
            });
        }
    }
});