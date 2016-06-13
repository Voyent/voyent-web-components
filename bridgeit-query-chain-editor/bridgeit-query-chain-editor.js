var BridgeIt = BridgeIt || {};

BridgeIt.QueryChainEditor = Polymer({
    is: "bridgeit-query-chain-editor",

    properties: {
        /**
         * Defines the BridgeIt realm to build query chains for.
         */
        realm: { type: String },
        /**
         * Defines the BridgeIt account to build query chains for.
         */
        account: { type: String },
        /**
         * Defines the currently selected query service category, including the observer that will fire the changed function
         */
        selectedQuery: { type: Number, value: 0, notify: true, observer: '_selectedQueryChanged' }
    },
    
    /**
     * Usual ready function
     * This will initialize the palette, workflow, and saved workflows
     */
    ready: function() {
        // Initialize our various data
        this.initializeData();
        
        // The current data we are working on in our view
        // For terminology we use "chain" at the service level and "workflow" for the UI
        this.resetWorkflow();
        
        // NTFY-385 MANUAL For now we do some low level GET/POST/etc. until support is added to the bridgeit client library
        this.tempUrl = 'http://dev.bridgeit.io/';
        this.tempQueryService = 'query/';
        this.tempTransformerResource = 'transformers/';
        this.tempQueryResource = 'queries/';
    },
    
    /**
     * Reset the internal ID and initialize our data
     * If our account and realm are valid we will try to load query services and transformers for our palette
     */
    initializeData: function() {
        this._internalId = 0;
        this.loading = false;
        
        if (!this.account || !this.realm) {
            return;
        }
        
        this.getQueryServices();
        this.getTransformers();
    },
    
    /** NTFY-385 MANUAL */
    buildUrl: function(service, resource, custom) {
        var toReturn = this.tempUrl + service + this.account + '/realms/' + this.realm + '/' + resource;
        if (custom) {
            toReturn += custom;
        }
        toReturn += "?access_token=" + bridgeit.io.auth.getLastAccessToken();
        return toReturn;
    },
    
    /**
     * Function to initialize the palette, specifically the queries and their service grouping
     * The optional callback will be fired after our processing is done
     * @param callback
     */
    getQueryServices: function(callback) {
        if (!this.account || !this.realm) {
            return;
        }
        
        this.set('_queryServices', []);
        this._savedWorkflows = [];
        
        var _this = this;
        bridgeit.io.query.findQueries({
            account: this.account,
            realm: this.realm
        }).then(function(results) {
            if (results) {
                var services = [];
                var currentResult;
                var added = false;
                
                // Get a list of unique services to categorize by
                for (var i = 0; i < results.length; i++) {
                    currentResult = results[i];
                    
                    if (currentResult.properties && currentResult.properties.type !== 'chain') {
                        added = false;
                        
                        // Look through our current service for a match
                        // If we find that add our query as a new child
                        for (qc in _this._queryServices) {
                            if (_this._queryServices[qc].name === currentResult.properties.service) {
                                _this.push('_queryServices.' + qc + '.queries', currentResult);
                                
                                added = true;
                                break;
                            }
                        }
                        
                        // Otherwise we add the new service as well as the query
                        if (!added) {
                            _this.push('_queryServices', {"name": currentResult.properties.service, "queries": [ currentResult ]}); 
                        }
                    }
                    else {
                        _this.push('_savedWorkflows', currentResult); 
                    }
                }
                
                // Select a default service if we can
                if (_this._queryServices.length > 0) {
                    _this.set('selectedQuery', 0);
                    _this.set('_queries', _this._queryServices[_this.selectedQuery].queries);
                }
            }
            
            if (callback) {
                callback();
            }
        }).catch(function(error){
            _this.fire('message-error', "Error when trying to find queries: " + error.toSource()); 
        });
    },
    
    /**
     * Function to initialize the palette, specifically the transformers
     */
    getTransformers: function() {
        if (!this.account || !this.realm) {
            return;
        }
        
        this._transformers = [];
        
        var _this = this;
        // NTFY-385 MANUAL Should have a client library function to GET all transformers from the service
        bridgeit.$.getJSON(this.buildUrl(this.tempQueryService, this.tempTransformerResource)).then(function(results) {
            if (results && results.length > 0) {
                _this._transformers = results;
            }
        }).catch(function(error){
            _this.fire('message-error', "Error when trying to find transformers: " + error.toSource());
        });
    },
    
    /**
     * Swap some CSS to toggle the Palette column size
     * This gives more room for the Workflow
     * @param e
     */
    toggleColumn: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        var id = e.target.getAttribute('data-id');
        var baseClass = e.target.getAttribute('data-class');
        
        if (!id || !baseClass) {
            return;
        }
        
        var ourDiv = this.querySelector('#' + id);
        
        if (ourDiv) {
            if (ourDiv.classList.contains('collapsed')) {
                ourDiv.classList.remove('collapsed');
                ourDiv.classList.add(baseClass);
            }
            else {
                ourDiv.classList.add('collapsed');
                ourDiv.classList.remove(baseClass);
            }
        }
    },
    
    /**
     * Called when a tab is selected for a Transformer workflow item
     * This is used to keep our UI controls in sync with the raw JSON, and vice versa
     * Note this will only be called for Mapper types
     * @param e
     */
    transformerTabChange: function(e) {
        var item = this._getWorkflowItemById(e.target.getAttribute('data-workflow-item'));
        
        // Have to use hardcoded tab numbers, with 0 = Properties, 1 = Transformer, 2 = Raw
        // So basically if we're going to Raw convert our UI controls to raw JSON so the view is updated
        if (item && item.selected === 2) {
            this._convertControlToMapper(item);
        }
    },
    
    /**
     * Create a new blank query in the workflow
     * Useful for non-chain editing
     * @param e
     */
    createNewQuery: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        this._addGeneric({"_id": "newQuery", "properties": {"type": "find", "service": "event", "collection": "event.events", "parameters": []}, "query": {"find": {}, "fields": {}, "options": {}}},
                         'query');
    },
    
    /**
     * Create a new blank transformer in the workflow
     * Useful for non-chain editing
     * @param e
     */
    createNewTransformer: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        this._addGeneric({"_id": "newTransformer", "properties": {"type": "mapper"}, "transform": {}},
                         'transform');
    },
    
    /**
     * Add a query item to the workflow
     * @param e
     */
    addQueryToWorkflow: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        this._addGeneric(e.model.query, 'query');
    },
    
    /**
     * Add a transformer item to the workflow
     * @param e
     */
    addTransformerToWorkflow: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        this._addGeneric(e.model.transformer, 'transform');
    },

    /** Adds parameters to the main workflow
     * @param e
     */
    addMainParam: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        this.push('_workflow.properties.parameters', {"name":"","type":"","desc":"","default":""});
    },
    
    /**
     * Removes parameters from the main workflow
     * @param e
     */
    removeMainParam: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        if (this._workflow.properties.parameters.length > 0) {
            this.pop('_workflow.properties.parameters');
        }
    },
    
    /**
     * Adds parameters to query dialogs
     * @param e
     */
    addItemParam: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        var item = this._getWorkflowItemById(e.target.getAttribute('data-workflow-item'));
        if (item) {
            this.push('_workflow.query.'+ this._workflow.query.indexOf(item) +'.item.properties.parameters',{"name":"","type":"","desc":"","default":""});
        }
    },
    
    /**
     * Removes parameters from query dialogs
     * @param e
     */
    removeItemParam: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        var item = this._getWorkflowItemById(e.target.getAttribute('data-workflow-item'));
        if (item) {
            var index = this._workflow.query.indexOf(item);
            if (this._workflow.query[index].item.properties.parameters.length > 0) {
                this.pop('_workflow.query.'+index+'.item.properties.parameters');
            }
        }
    },
    
    /**
     * Adds a set of controls for the current transformer workflow item
     * @param e
     */
    addTransformerControl: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        var item = this._getWorkflowItemById(e.target.getAttribute('data-workflow-item'));
        if (item) {
            this.push('_workflow.query.' + this._workflow.query.indexOf(item) + '.controls', this._makeTransformerControl());
        }
    },
    
    /**
     * Removes a set of controls for the current transformer workflow item
     * @param e
     */
    removeTransformerControl: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        var item = this._getWorkflowItemById(e.target.getAttribute('data-workflow-item'));
        if (item) {
            var index = this._workflow.query.indexOf(item);
            if (this._workflow.query[index].controls.length > 0) {
                this.pop('_workflow.query.' + index + '.controls');
            }
        }
    },
    
    /**
     * Move the current workflow item up in the order
     * @param e
     */
    moveUpWorkflowItem: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        this._moveGenericWorkflowItem(e.model.workflowItem, true);
    },
    
    /**
     * Move the current workflow item down in the order
     * @param e
     */
    moveDownWorkflowItem: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        this._moveGenericWorkflowItem(e.model.workflowItem, false);
    },
    
    /**
     * Remove the current workflow item, such as a query or transformer
     * @param e
     */
    removeWorkflowItem: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        var item = this._getWorkflowItemById(e.target.getAttribute('data-workflow-item'));
        if (item) {
            this.splice('_workflow.query', this._workflow.query.indexOf(item), 1);
        }
    },
    
    /**
     * Remove the current palette query item
     * This is necessary since we can add items so we need a way to manage the list
     * @param e
     */
    removePaletteQuery: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        var removeId = e.target.getAttribute('data-workflow-item');
        
        this._removePaletteGeneric('query', removeId, this._queries, '_queries');
    },
    
    /**
     * Remove the current palette transformer item
     * This is necessary since we can add items so we need a way to manage the list
     * @param e
     */
    removePaletteTransformer: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        var removeId = e.target.getAttribute('data-workflow-item');
        
        this._removePaletteGeneric('transformer', removeId, this._transformers, '_transformers');
    },
    
    /**
     * Public UI method to execute up to the passed workflow item
     * @param e
     */
    executeWorkflowItem: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        var item = this._getWorkflowItemById(e.target.getAttribute('data-workflow-item'));
        if (item) {
            // TODO LATER we need to pass a "stopHere" with the selected workflow item ID, to ensure chain execution halts at a certain query/transformer
            this._executeWorkflow();
        }
    },
    
    /**
     * Public UI method to execute the entire workflow
     * @param e
     */
    executeWorkflow: function(e) {
        this._executeWorkflow();
    },

    /**
     * Public UI method to persist workflow queries
     * @param e
     */
    persistWorkflowQueries: function(e) {
        this._persistWorkflowQueries();
    },
    
    /**
     * Public UI method to persist the workflow chain
     * @param e
     */
    persistWorkflowChain: function(e) {
        // First we need to determine if we're a chain or not
        // Either way we'll save our queries, then maybe save our chain
        if (this._workflow.isChain) {
            var _this = this;
            this._persistWorkflowQueries(function() {_this._persistWorkflowChain() });
        }
        else {
            this._persistWorkflowQueries();
        }
    },
    
    /**
     * Load a saved workflow, including id, name, and content
     * @param e
     */
    loadWorkflow: function(e) {
        this.set('loading', true);
        
        var loadId = e.target.getAttribute('data-workflow-item');
        
        // First we find the workflow that was requested from our savedWorkflow list
        // We will assign that over our existing workflow
        for (var i = 0; i < this._savedWorkflows.length; i++) {
            if (loadId === this._savedWorkflows[i]._id) {
                this.set('_workflow', JSON.parse(JSON.stringify(this._savedWorkflows[i])));
                this.set('_workflow.selected', 0);
                this.set('_workflow.isChain', true);
                break;
            }
        }
        
        // Loop through our query/transformer items and convert them to a format the UI will understand
        var loadedItems = [];
        var currentQuery = null;
        var pulledItem = null;
        for (var i = 0; i < this._workflow.query.length; i++) {
            currentQuery = this._workflow.query[i];
            pulledItem = null;
            
            if (this._isQuery(currentQuery.type)) {
                for (var j = 0; j < this._queryServices.length; j++) {
                    for (var subQuery = 0; subQuery < this._queryServices[j].queries.length; subQuery++) {
                        if (currentQuery.id === this._queryServices[j].queries[subQuery]._id) {
                            pulledItem = this._queryServices[j].queries[subQuery];
                            break;
                        }
                    }
                }
            }
            else if (this._isTransformer(currentQuery.type)) {
                for (var j = 0; j < this._transformers.length; j++) {
                    if (currentQuery.id === this._transformers[j]._id) {
                        pulledItem = this._transformers[j];
                        break;
                    }
                }
            }
            else {
                this.fire('message-error', 'Unrecognized chain item type (looking for query or transform): found '+ currentQuery.type);
                pulledItem = null;
            }
            
            // Check if we have a pulled JSON item to make a workflow item from
            if (pulledItem) {
                loadedItems.push(this._makeWorkflowItem(currentQuery.type, JSON.parse(JSON.stringify(pulledItem))));
            }
            // If we don't have an item it means the workflow chain had an invalid or outdated query/transformer
            // We will note this in the logs
            else {
                this.fire('message-error', "Failed to add " + currentQuery.id + " to workflow (outdated query/transformer?)"); 
            }
        }
        
        // Clear our old query array since we've converted it from type/id to workflow items
        this.splice('_workflow.query', 0, this._workflow.query.length);
        
        // Because Polymer doesn't support more complex array operations (like concat) we have to loop through our loadedItems and push each one
        // We also need to use a setTimeout to ensure the previous state is applied properly first
        //  Namely clearing any previous results in the UI
        var _this = this;
        setTimeout(function() {
            for (var insert = 0; insert < loadedItems.length; insert++) {
                _this.push('_workflow.query', loadedItems[insert]);
            }
            
            _this.set('loading', false);
        },0);
    },
    
    /**
     * Delete a saved workflow from our list
     * @param e
     */
    removeWorkflow: function(e) {
        var removeId = e.target.getAttribute('data-workflow-item');
        
        if (!window.confirm("Are you sure you want to delete the '" + removeId + "' workflow?")) {
            return;
        }
        
        var deleteIndex = -1;
        for (var i = 0; i < this._savedWorkflows.length; i++) {
            if (removeId === this._savedWorkflows[i]._id) {
                deleteIndex = i;
                break;
            }
        }
        
        if (deleteIndex >= 0) {
            var _this = this;
            bridgeit.io.query.deleteQuery({
                account: this.account,
                realm: this.realm,
                id: removeId
            }).then(function() {
                _this.splice('_savedWorkflows', deleteIndex, 1);
            }).catch(function(error) {
                 _this.fire('message-error', 'Failed to delete workflow chain ' + removeId + ':' + error.toSource());
            });
        }
    },
    
    /**
     * Clear the workflow state, including id, name, and content
     * @param e
     */
    resetWorkflow: function(e) {
        this.set('_workflow', { "_id":"newWorkflow", "selected": 0, "isChain": true, "properties": { "title":"New Workflow", "parameters":[], "execParams": "" }, "query":[] });
    },
    
    //******************PRIVATE API******************
    
    /**
     * Execute the passed step of the desired workflow
     * We will store the results as JSON in 'result'
     * @param callback
     */
    _executeWorkflow: function(callback) {
        var _this = this;
        var executeCallback = function() {
            // NTFY-385 MANUAL We should have a way to execute a query from our client library
            var urlParams = "&exec=true";
            
            // If we're a chain we want to execute in debug mode
            // TODO NTFY-384 This should work for non-chains as well. May require some result parsing changes below
            if (_this._workflow.isChain) {
                urlParams += "&mode=debug";
            }
            
            // If this workflow has exec params, which are basically user specified JSON parameters, we need to encode that and pass it as execParams
            if (_this._workflow.properties.execParams) {
                urlParams += ("&execParams=" + encodeURIComponent(_this._workflow.properties.execParams));
            }
            
            // If we are a chain we use the workflow query chain ID as the execution target
            // Otherwise we use the single item to process
            var executeId = _this._workflow._id;
            var executeResource = _this.tempQueryResource;
            if (!_this._workflow.isChain) {
                executeId = _this._workflow.query[0].item._id;
                if (_this._isTransformer(_this._workflow.query[0].type)) {
                    executeResource = _this.tempTransformerResource;
                }
            }
            
            if (executeId) {
                var executeUrl = _this.buildUrl(_this.tempQueryService, executeResource, executeId) + urlParams;
                this.fire('message-info', "Exec: " + executeId + " to " + executeUrl);
                
                bridgeit.$.getJSON(executeUrl)
                          .then(function(results) {
                    if (_this._workflow.isChain) {              
                        // Loop through results and set them into each workflowItem
                        var currentWorkflow = null;
                        for (var i = 0; i < _this._workflow.query.length; i++) {
                            currentWorkflow = _this._workflow.query[i];
                            
                            // Reset our results in case we don't get new ones
                            _this.set('_workflow.query.' + i + '.result', "");
                            
                            if (results && results[currentWorkflow.item._id]) {
                                _this.set('_workflow.query.' + i + '.result', JSON.stringify(results[currentWorkflow.item._id], undefined, 4));
                            }
                        }
                    }
                    else {
                        _this.set('_workflow.query.0.result', "");
                        _this.set('_workflow.query.0.result', JSON.stringify(results, undefined, 4));
                    }
                    
                    if (callback) { callback(); }
                }).catch(function(error){
                    _this.fire('message-error', "Error when trying to execute query: " + error.toSource());
                    
                    if (callback) { callback(); }
                });
            }
        };
        
        // Persist our queries/transformers, then the entire chain, and finally execute
        // These asynchronous functions need a bunch of callbacks because processing can't continue until the previous step completes
        // For example we want to ensure our queries are saved/updated properly before we try to execute anything
        // Note we could have a non-chain, in which case we save just our queries/transformers and execute
        if (this._workflow.isChain) {
            this._persistWorkflowQueries(function() {_this._persistWorkflowChain(executeCallback) });
        }
        else {
            // Only bother executing if we have an actual query/transformer
            if (this._workflow.query.length > 0) {
                this._persistWorkflowQueries(executeCallback);
            }
        }
    },
    
    /**
     * Save or update all the current queries and transformers for the workflow
     * The callback will be fired after every query/transformer is properly handled, not on a per-item basis
     * @param callback
     */
    _persistWorkflowQueries: function(callback) {
        var _this = this;
        var loopWorkflowItem = null;
        var refreshPalette = false;
        var completeLength = 0;
        var loopCallback = function() {
            completeLength++;
            if (completeLength === _this._workflow.query.length) {
                // Refresh our lists if we added something
                if (refreshPalette) {
                    _this.getQueryServices(function() {
                        _this.getTransformers();
                        if (callback) {
                            callback();
                        }
                    });
                }
                else {
                    if (callback) {
                        callback();
                    }
                }
            }
        };
        
        // Try to persist (create/update) each query/transformer in our current workflow
        if (this._workflow.query.length > 0) {
            for (var i = 0; i < this._workflow.query.length; i++) {
                loopWorkflowItem = this._workflow.query[i];
                
                // If we are interacting with a "mapper" type of Transformer we need to convert our UI controls to raw JSON data
                // Basically ensuring that any changes the user made at the UI level are reflected in the data we're trying to persist
                if (this._isTransformer(loopWorkflowItem.type) && this._isTransformerMapper(loopWorkflowItem.item.properties.type)) {
                    this._convertControlToMapper(loopWorkflowItem);
                }
                // Also if we have a query (aggregate) we need to convert the raw JSON to our internal object
                if (this._isQuery(loopWorkflowItem.type) && this._isAggregate(loopWorkflowItem.item.properties.type)) {
                    if (loopWorkflowItem.queryFormatted) {
                        loopWorkflowItem.item.query = JSON.parse(loopWorkflowItem.queryFormatted);
                    }
                }
                
                // Check if our current query/transformer even changed since the last persist
                // If it didn't we don't need to hit the service again
                if (JSON.stringify(loopWorkflowItem.item) != JSON.stringify(loopWorkflowItem.originalItem)) {
                    // Now if our workflow item DID change, we want to see if the ID changed
                    // If the ID did change we'll want to try to POST (create), otherwise PUT (update)
                    if (loopWorkflowItem.originalItem._id != loopWorkflowItem.item._id) {
                        refreshPalette = true;
                        this._saveWorkflowItem(loopWorkflowItem, loopCallback);
                    }
                    else {
                        this._updateWorkflowItem(loopWorkflowItem, loopCallback);
                    }
                    
                    // Also update our internal item to know the changed version is now the current version
                    // Technically we should only do this on a valid save/update from the service
                    loopWorkflowItem.originalItem = JSON.parse(JSON.stringify(loopWorkflowItem.item));
                }
                else {
                    loopCallback();
                }
            }
        }
        // If we don't have any workflow items to save just execute our callback
        else {
            if (callback) {
                callback();
            }
        }
    },
    
    /**
     * Save the current workflow
     * The content will be saved (either new or updated)
     * @param callback
     */
    _persistWorkflowChain: function(callback) {
        // Check for an existing saved workflow with the same ID
        // If we find it override it, otherwise save the workflow as new
        var updateIndex = -1;
        for (var i = 0; i < this._savedWorkflows.length; i++) {
            if (this._workflow._id === this._savedWorkflows[i]._id) {
                updateIndex = i;
                break;
            }
        }
        
        // We need to convert our workflow object to a valid service-level chain
        // First set the basic JSON outline of the chain. We can use our existing properties and ID
        var toPersist = {"_id": this._workflow._id, "properties": this._workflow.properties, "query": []};
        toPersist.properties.type = "chain";
        
        // Loop through our query list (which are workflowItem objects) and convert to a chain style id/type
        var currentLoopItem = null;
        for (var j = 0; j < this._workflow.query.length; j++) {
            currentLoopItem = this._workflow.query[j];
            toPersist.query.push({"type": currentLoopItem.type, "id": currentLoopItem.item._id});
        }
        
        // If our updateIndex is -1 it means it's still the default, so we didn't find an existing chain and will POST
        if (updateIndex === -1) {
            // POST to the service with our new query chain
            var _this = this;
            bridgeit.io.query.createQuery({
                account: this.account,
                realm: this.realm,
                id: this._workflow._id,
                query: toPersist
            }).then(function(uri) {
                // Update our UI level list on success
                _this.push('_savedWorkflows', toPersist);
                
                if (callback) { callback(); }
            }).catch(function(error) {
                _this.fire('message-error', 'Failed to save workflow chain: ' + error.toSource());
                
                if (callback) { callback(); }
            });
        }
        // Otherwise we found an existing chain and will update instead
        else {
            // Do a PUT via the update call
            var _this = this;
            bridgeit.io.query.updateQuery({
                account: this.account,
                realm: this.realm,
                id: this._workflow._id,
                query: toPersist
            }).then(function(uri){
                // Update our UI level list on success
                _this.set('_savedWorkflows.' + updateIndex, toPersist);
                
                if (callback) { callback(); }
            }).catch(function(error){
                 _this.fire('message-error', 'Failed to update workflow chain: ' + error.toSource());
                 
                if (callback) { callback(); }
            });
        }
    },
    
    /**
     * Save/create the passed workflow query/transformer
     * The callback will be fired on success or error of the POST
     * Note this function will try to call updateWorkflowQuery if the save/create fails
     *  This could be because the resource already exists, etc.
     * @param workflowItem
     * @param callback
     * @private
     */
    _saveWorkflowItem: function(workflowItem, callback) {
        // NTFY-385 MANUAL Need to determine if we use the query or transformer service for our save
        var _this = this;
        var desiredResource = this._isQuery(workflowItem.type) ? this.tempQueryResource : this.tempTransformerResource;
        bridgeit.$.post(this.buildUrl(this.tempQueryService, desiredResource, workflowItem.item._id), workflowItem.item).then(function() {
            if (callback) { callback(); }
        }).catch(function(error) {
            _this.fire('message-error', "Failed to save individual query/transformer '" + workflowItem.item._id + "', going to try to update. Error: " + error.toSource());
            
            _this._updateWorkflowItem(workflowItem, callback);
        });
    },

    /**
     * Update the passed workflow query/transformer
     * The callback will be fired on success or error of the PUT
     * @param workflowItem
     * @param callback
     * @private
     */
    _updateWorkflowItem: function(workflowItem, callback) {
        // NTFY-385 MANUAL Need to determine if we use the query or transformer service for our update
        var desiredResource = this._isQuery(workflowItem.type) ? this.tempQueryResource : this.tempTransformerResource;
        bridgeit.$.put(this.buildUrl(this.tempQueryService, desiredResource, workflowItem.item._id), workflowItem.item).then(function() {
            if (callback) { callback(); }
        }).catch(function(error) {
            _this.fire('message-error', "Failed to update individual query/transformer '" + workflowItem.item._id + "': " + error.toSource());
            
            if (callback) { callback(); }
        });
    },
    
    /**
     * Search the passed list looking for an item with the matching removeId, then delete it
     * This will make a call to deleteQuery, so this is used for deleting queries OR transformers from the palette
     * This will also update the UI level palette
     * @param type ('query' or 'transformer')
     * @param removeId
     * @param list
     * @param listName
     * @private
     */
    _removePaletteGeneric: function(type, removeId, list, listName) {
        if (!window.confirm("Are you sure you want to delete the '" + removeId + "' " + type + "?")) {
            return;
        }
        
        var deleteIndex = -1;
        for (var i = 0; i < list.length; i++) {
            if (removeId === list[i]._id) {
                deleteIndex = i;
                break;
            }
        }
        
        if (deleteIndex >= 0) {
            var _this = this;
            if (this._isQuery(type)) {
                bridgeit.io.query.deleteQuery({
                    account: this.account,
                    realm: this.realm,
                    id: removeId
                }).then(function() {
                    _this.splice(listName, deleteIndex, 1);
                }).catch(function(error) {
                     _this.fire('message-error', 'Failed to delete ' + type + ' ' + removeId + ':' + error.toSource());
                });
            }
            // NTFY-385 MANUAL Need a way to delete transformers from the client library
            else if (this._isTransformer(type)) {
                bridgeit.$.doDelete(this.buildUrl(this.tempQueryService, this.tempTransformerResource, removeId)).then(function() {
                    _this.splice(listName, deleteIndex, 1);
                }).catch(function(error){
                    _this.fire('message-error', 'Failed to delete ' + type + ' ' + removeId + ':' + error.toSource());
                });
            }
        }
    },
    
    /**
     * Move the passed item up or down in the workflow order
     * @param item
     * @param isUp
     * @private
     */
    _moveGenericWorkflowItem: function(item, isUp) {
        var currPos = this._workflow.query.indexOf(item);
        var newPos = isUp ? currPos-1 : currPos+1;
        if (newPos < 0 || newPos == this._workflow.query.length) {
            return;
        }
        
        this.splice('_workflow.query',currPos,1);
        this.splice('_workflow.query',newPos,0,item);
    },
    
    /**
     * Query ondragstart event handler.
     * @param e
     * @private
     */
    _startDragQuery: function(e) {
        this._startDragCommon(e);
        e.dataTransfer.setData('query', e.model.query); //indicate that this item is a query
        this._lastDragged = e.model.query; //reference query so we can populate the UI on drop
    },

    /**
     * Transformer ondragstart event handler.
     * @param e
     * @private
     */
    _startDragTransformer: function(e) {
        this._startDragCommon(e);
        e.dataTransfer.setData('transform', e.model.transformer); //indicate that this item is a transformer
        this._lastDragged = e.model.transformer; //reference transformer so we can populate the UI on drop
    },

    /**
     * Workflow ondragover event handler.
     * @param e
     * @private
     */
    _dragOverWorkflow: function(e) {
        e.preventDefault();
    },
    
    /**
     * Common function fired when the drag event starts
     * This is primarily to create a styling and effect for the drop area
     * @param e
     * @private
     */
    _startDragCommon: function(e) {
        var workflowDiv = this.querySelector("#workflow");
        if (workflowDiv) {
            workflowDiv.classList.add('dropzone');
        }
    },
    
    /**
     * Common function fired when the drag event ends
     * This is primarily to remove the styling of the drop area
     * @param e
     * @private
     */
    _commonDragEnd: function(e) {
        var workflowDiv = this.querySelector("#workflow");
        if (workflowDiv) {
            workflowDiv.classList.remove('dropzone');
        }
    },
    
    /**
     * Workflow ondrop event handler.
     * @param e
     * @private
     */
    _dropInWorkflow: function(e) {
        e.preventDefault();
        
        this._addGeneric(JSON.parse(JSON.stringify(this._lastDragged)),
                         e.dataTransfer.getData('query') ? 'query' : 'transform');
    },
    
    /**
     * Add a generic item (either query or transformer) to our workflow
     * @param item
     * @param type
     * @private
     */
    _addGeneric: function(item, type) {
        // Note that if we're not in a chain we need to limit our list to a single item
        if (!this._workflow.isChain) {
            this.splice('_workflow.query', 0, this._workflow.query.length);
        }
        
        // Then add our item
        this.push('_workflow.query', this._makeWorkflowItem(type, item));
    },
    
    /**
     * Template helper function.
     * @param type
     * @returns {boolean}
     * @private
     */
    _isQuery: function(type) {
        return type === 'query';
    },

    /**
     * Template helper function.
     * @param type
     * @returns {boolean}
     * @private
     */
    _isFind: function(type) {
        return type === 'find';
    },

    /**
     * Template helper function.
     * @param type
     * @returns {boolean}
     * @private
     */
    _isAggregate: function(type) {
        return type === 'aggregate';
    },
    
    /**
     * Template helper function.
     * @param type
     * @returns {boolean}
     * @private
     */
    _isTransformer: function(type) {
        return type === 'transform' || type === 'transformer';
    },
    
    /**
     * Template helper function.
     * @param type
     * @returns {boolean}
     * @private
     */
    _isTransformerMapper: function(type) {
        return type === 'mapper';
    },
    
    /**
     * Template helper function.
     * @param json
     * @returns {String}
     * @private
     */
    _formatJSON: function(json) {
        if (json) {
            return JSON.stringify(json, undefined, 4);
        }
        return "";
    },
    
    /**
     * Template helper function.
     * @param change
     * @returns {Integer}
     * @private
     */
    _arrayLength: function(change) {
        return change.base.length;
    },
    
    /**
     * Template helper function.
     * This will strip any prefix service from our collection name
     * @param service
     * @param collection
     * @returns {String}
     * @private
     */
    _stripCollection: function(service, collection) {
        if (service && collection) {
            if (collection.indexOf(service + '.') !== -1) {
                return collection.substring(collection.indexOf(service + '.')+service.length+1);
            }
        }
        return collection;
    },
    
    /**
     * Function called when the query service is changed
     * @private
     */
    _selectedQueryChanged: function() {
        if (this._queryServices) {
            this.set('_queries', this._queryServices[this.selectedQuery].queries);
        }
    },
    
    /**
     * Create a new workflow item JSON object from the passed type and item content
     * This basically wraps service-level content with UI specific workflow data, such as selected
     * This will use internalId to maintain a UI level ID (mainly for drag and drop)
     * @param type
     * @param item
     * @private
     */
    _makeWorkflowItem: function(type, item) {
        this._internalId++;

        var toReturn = {"id":"workflowItem" + this._internalId, "originalItem":JSON.parse(JSON.stringify(item)),
                        "type":type, "selected":0, "item":item, "result":""};
        
        // For transformers we need to map our JSON data to UI elements
        if (this._isTransformer(type)) {
            // Set our default controls
            toReturn.controls = [];
            
            // Next we convert any transformer JSON data into a valid UI control scheme
            if (this._isTransformerMapper(item.properties.type) && item.transform) {
                this._convertMapperToControl(toReturn);
            }
        }
        // For queries we need to format the JSON for raw output
        if (this._isQuery(type)) {
            toReturn.queryFormatted = this._formatJSON(item.query);
            
            // Workaround for computed bindings in a dynamic template repeat being passed to Polymer components that initialize with ready
            // Basically the computed binding isn't called early enough and is considered undefined in the ready
            // So we replicate the computed binding here and store it as a separate property that can be directly accessed in the lifecycle
            toReturn.collectionFormatted = this._stripCollection(item.properties.service, item.properties.collection);
        }
        
        return toReturn;
    },
    
    /**
     * Create a new set of transformer controls for a workflow item
     * The attributes will have default values, but the structure is correct
     * @private
     */
    _makeTransformerControl: function() {
        return { "from": "", "to": "", "default": "", "options": { "wrap": false, "flatten": false } };
    },
    
    /**
     * Convert mapper transformer JSON data into valid UI controls
     * Basically convert workflowItem.item.transform into workflowItem.controls
     * @param workflowItem
     * @private
     */
    _convertMapperToControl: function(workflowItem) {
        var _this = this;
        var index = this._workflow.query.indexOf(workflowItem);
        var toPush = null;
        var currentData = null;
        workflowItem.controls = [];
        
        Object.keys(workflowItem.item.transform).forEach(function(k) {
            toPush = _this._makeTransformerControl();
            currentData = workflowItem.item.transform[k];
            
            toPush.from = currentData.path;
            toPush.to = k;
            toPush.default = currentData.default;
            if (currentData.options) {
                toPush.options.wrap = (currentData.options.wrap || currentData.options.wrap == "true");
                toPush.options.flatten = (currentData.options.flatten || currentData.options.flatten == "true");
            }
            
            workflowItem.controls.push(toPush);
        });
        this.notifyPath('_workflow.query.' + index + '.controls', workflowItem.controls);
    },
    
    /**
     * Convert UI controls to valid mapper transformer JSON data
     * Basically convert workflowItem.controls into workflowItem.item.transform
     * @param workflowItem
     * @private
     */
    _convertControlToMapper: function(workflowItem) {
        var index = this._workflow.query.indexOf(workflowItem);
        var originalData = JSON.parse(JSON.stringify(workflowItem.item.transform));
        var currentControl = null;
        workflowItem.item.transform = {};
        
        for (var i = 0; i < workflowItem.controls.length; i++) {
            currentControl = workflowItem.controls[i];
            
            workflowItem.item.transform[currentControl.to] =
                {"path": currentControl.from,
                 "default": currentControl.default,
                 "options": {
                    "wrap": currentControl.options.wrap,
                    "flatten": currentControl.options.flatten
                 }
                };
        }
        this.notifyPath('_workflow.query.' + index + '.item.transform', workflowItem.item.transform);
    },
    
    /**
     * Helper function to get an actual workflow item via an ID
     * @param id
     * @returns {Object}
     * @private
     */
    _getWorkflowItemById: function(id) {
        if (id) {
            for (var i = 0; i < this._workflow.query.length; i++) {
                if (this._workflow.query[i] && this._workflow.query[i].id == id) {
                    return this._workflow.query[i];
                }
            }
        }
    }
});