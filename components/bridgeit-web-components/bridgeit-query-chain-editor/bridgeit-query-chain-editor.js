var BridgeIt = BridgeIt || {};

BridgeIt.QueryChainEditor = Polymer({
    is: "bridgeit-query-chain-editor",

    properties: {
        /**
         * Defines the BridgeIt realm to build query chains for.
         * @default bridgeit.io.auth.getLastKnownRealm()
         */
        realm: { type: String },
        /**
         * Defines the BridgeIt account to build query chains for.
         * @default bridgeit.io.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * Defines the currently selected query service category, including the observer that will fire the changed function
         */
        selectedQuery: { type: Number, default: 0, notify: true, observer: '_selectedQueryChanged' }
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
        
        // TODO MANUAL For now we do some manual GET/POST/etc. until support is added to the bridgeit client library
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
        
        if (!this.account || !this.realm) {
            return;
        }
        
        this.getQueryServices();
        this.getTransformers();
    },
    
    /** TODO MANUAL */
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
     */
    getQueryServices: function() {
        if (!this.account || !this.realm) {
            return;
        }
        
        this._queryServices = [];
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
                }
            }
        }).catch(function(error){
            console.error("Error when trying to find queries: " + error.toSource());
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
        // TODO MANUAL Should have a client library function to GET all transformers from the service
        bridgeit.$.getJSON(this.buildUrl(this.tempQueryService, this.tempTransformerResource)).then(function(results) {
            if (results && results.length > 0) {
                _this._transformers = results;
            }
        }).catch(function(error){
            console.error("Error when trying to find transformers: " + error.toSource());
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
     * Public UI method to execute a workflow
     * @param e
     */
    executeWorkflow: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
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
        // Save our workflow queries/transformers first, then when that's done try to save our chain
        var _this = this;
        this._persistWorkflowQueries(function() {_this._persistWorkflowChain() });
    },
    
    /**
     * Load a saved workflow, including id, name, and content
     * @param e
     */
    loadWorkflow: function(e) {
        var loadId = e.target.getAttribute('data-workflow-item');
        
        // First we find the workflow that was requested from our savedWorkflow list
        // We will assign that over our existing workflow
        for (var i = 0; i < this._savedWorkflows.length; i++) {
            if (loadId === this._savedWorkflows[i]._id) {
                this._workflow = JSON.parse(JSON.stringify(this._savedWorkflows[i])); // clone
                this._workflow.selected = 0;
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
            
            if (currentQuery.type === 'query') {
                for (var j = 0; j < this._queryServices.length; j++) {
                    for (var subQuery = 0; subQuery < this._queryServices[j].queries.length; subQuery++) {
                        if (currentQuery.id === this._queryServices[j].queries[subQuery]._id) {
                            pulledItem = this._queryServices[j].queries[subQuery];
                            break;
                        }
                    }
                }
            }
            else if (currentQuery.type === 'transform') {
                for (var j = 0; j < this._transformers.length; j++) {
                    if (currentQuery.id === this._transformers[j]._id) {
                        pulledItem = this._transformers[j];
                        break;
                    }
                }
            }
            else {
                console.error('Unrecognized chain item type (looking for query or transform): found '+ currentQuery.type);
                pulledItem = null;
            }
            
            // Check if we have a pulled JSON item to make a workflow item from
            if (pulledItem) {
                loadedItems.push(this._makeWorkflowItem(currentQuery.type, JSON.parse(JSON.stringify(pulledItem))));
            }
        }
        
        // Clear our old query array since we've converted it from type/id to workflow items
        this.splice('_workflow.query', 0, this._workflow.query.length);
        
        // Because Polymer doesn't support more complex array operations (like concat) we have to loop through our loadedItems and push each one
        for (var insert = 0; insert < loadedItems.length; insert++) {
            this.push('_workflow.query', loadedItems[insert]);
        }
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
                 console.error('Failed to delete workflow chain ' + removeId + ':' + error.toSource());
            });
        }
    },
    
    /**
     * Clear the workflow state, including id, name, and content
     * @param e
     */
    resetWorkflow: function(e) {
        this._workflow = { "_id":"newWorkflow", "selected": 0, "properties": { "title":"New Workflow", "parameters":[] }, "query":[] }
    },
    
    //******************PRIVATE API******************
    
    /**
     * Execute the passed step of the desired workflow
     * We will store the results as JSON in 'result'
     * @param callback
     */
    _executeWorkflow: function(callback) {
        console.log("Exec: " + this._workflow._id);
        
        // TODO LATER we need to pass a "stopHere" with the selected workflow item ID, to ensure chain execution halts at a certain query/transformer
        
        // TODO Still be able to execute a single, non-chain query/transformer. This would change the UI a bit, and also use a different execution approach
        
        // Persist our queries/transformers, then the entire chain, and finally execute
        // These asynchronous functions need a bunch of callbacks because processing can't continue until the previous step completes
        // For example we want to ensure our queries are saved/updated properly before we try to execute anything
        var _this = this;
        this._persistWorkflowQueries(function() {_this._persistWorkflowChain(function() {
            // TODO MANUAL We should have a way to execute a query from our client library
            var urlParams = "&exec=true&mode=debug";
            
            // If this workflow has exec params, which are basically user specified JSON parameters, we need to encode that and pass it as execParams
            if (_this._workflow.properties.execParams) {
                urlParams += "&execParams=" + encodeURIComponent(JSON.stringify(_this._workflow.properties.execParams));
            }
            
            bridgeit.$.getJSON(_this.buildUrl(_this.tempQueryService, _this.tempQueryResource, _this._workflow._id) + urlParams)
                      .then(function(results) {
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
                
                if (callback) { callback(); }
            }).catch(function(error){
                console.error("Error when trying to execute query: " + error.toSource());
                
                if (callback) { callback(); }
            });
        })});
    },
    
    /**
     * Save or update all the current queries and transformers for the workflow
     * The callback will be fired after every query/transformer is properly handled, not on a per-item basis
     * @param callback
     */
    _persistWorkflowQueries: function(callback) {
        var _this = this;
        var loopWorkflowItem = null;
        var completeLength = 0;
        var loopCallback = function() {
            completeLength++;
            if (completeLength == _this._workflow.query.length) {
                if (callback) {
                    callback();
                }
            }
        };
        
        // Try to persist (create/update) each query/transformer in our current workflow
        for (var i = 0; i < this._workflow.query.length; i++) {
            loopWorkflowItem = this._workflow.query[i];
            
            // Check if our current query/transformer even changed since the last persist
            // If it didn't we don't need to hit the service again
            if (JSON.stringify(loopWorkflowItem.item) != JSON.stringify(loopWorkflowItem.originalItem)) {
                // Now if our workflow item DID change, we want to see if the ID changed
                // If the ID did change we'll want to try to POST (create), otherwise PUT (update)
                if (loopWorkflowItem.originalItem._id != loopWorkflowItem.item._id) {
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
                console.error('Failed to save workflow chain: ' + error.toSource());
                
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
                 console.error('Failed to update workflow chain: ' + error.toSource());
                 
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
        // TODO MANUAL Need to determine if we use the query or transformer service for our save
        var desiredResource = workflowItem.type === 'query' ? this.tempQueryResource : this.tempTransformerResource;
        bridgeit.$.post(this.buildUrl(this.tempQueryService, desiredResource, workflowItem.item._id), workflowItem.item).then(function() {
            if (callback) { callback(); }
        }).catch(function(error) {
            console.error("Failed to save individual query/transformer '" + workflowItem.item._id + "': " + error.toSource());
            
            if (callback) { callback(); }
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
        // TODO MANUAL Need to determine if we use the query or transformer service for our update
        var desiredResource = workflowItem.type === 'query' ? this.tempQueryResource : this.tempTransformerResource;
        bridgeit.$.put(this.buildUrl(this.tempQueryService, desiredResource, workflowItem.item._id), workflowItem.item).then(function() {
            if (callback) { callback(); }
        }).catch(function(error) {
            console.error("Failed to update individual query/transformer '" + workflowItem.item._id + "': " + error.toSource());
            
            if (callback) { callback(); }
        });
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
        
        var item = JSON.parse(JSON.stringify(this._lastDragged));
        var type = e.dataTransfer.getData('query') ? 'query' : 'transform'; //determine the dropped item type
        
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
        return type === 'transform';
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
     * Function called when the query service is changed
     * @private
     */
    _selectedQueryChanged: function() {
        if (this._queryServices) {
            this._queries = this._queryServices[this.selectedQuery].queries;
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
        return {"id":"workflowItem" + this._internalId, "originalItem":JSON.parse(JSON.stringify(item)),
                "type":type, "selected":0, "item":item, "result":""};
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