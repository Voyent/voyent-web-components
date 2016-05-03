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
        this._resetWorkflow();
        
        // TODO MANUAL For now we do some manual GET/POST/etc. until support is added to the bridgeit client library (related code with TODO MANUAL)
        this.tempUrl = 'http://dev.bridgeit.io/';
        this.tempQueryService = 'query/';
        this.tempTransformerResource = 'transformers/';
        this.tempQueryResource = 'queries/';
    },
    
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
            console.error("Error when trying to find queries: " + error);
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
        // TODO MANUAL
        bridgeit.$.getJSON(this.buildUrl(this.tempQueryService, this.tempTransformerResource)).then(function(results) {
            if (results && results.length > 0) {
                _this._transformers = results;
            }
        }).catch(function(error){
            console.error("Error when trying to find transformers: " + error.toSource());
        });
    },
    
    //******************PRIVATE API******************
    /**
     * Function called when the query service is changed
     * @private
     */
    _selectedQueryChanged: function() {
        if (this._queryServices) {
            this._queries = this._queryServices[this.selectedQuery].queries;
        }
    },
    
    /** Adds parameters to the main workflow
     * @param e
     * @private
     */
    _addMainParam: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        this.push('_workflow.properties.parameters', {"name":"","type":"","desc":"","default":""});
    },
    
    /**
     * Removes parameters from the main workflow
     * @param e
     * @private
     */
    _removeMainParam: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        if (this._workflow.properties.parameters.length > 0) {
            this.pop('_workflow.properties.parameters');
        }
    },
    
    /**
     * Adds parameters to query dialogs
     * @param e
     * @private
     */
    _addItemParam: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        var item = this._getWorkflowItemById(e.target.getAttribute('data-workflow-item'));
        if (item) {
            this.push('_workflow.query.'+ this._workflow.query.indexOf(item) +'.item.properties.parameters',{"name":"","type":"","desc":"","default":""});
        }
    },
    
    /**
     * Removes parameters from query dialogs
     * @param e
     * @private
     */
    _removeItemParam: function(e) {
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
     * @private
     */
    _removeWorkflowItem: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        
        var item = this._getWorkflowItemById(e.target.getAttribute('data-workflow-item'));
        if (item) {
            this.splice('_workflow.query', this._workflow.query.indexOf(item), 1);
        }
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
     * Create a new workflow item JSON object from the passed type and item content
     * This basically wraps service-level content with UI specific workflow data, such as selected
     * This will use internalId to maintain a UI level ID (mainly for drag and drop)
     * @param type
     * @param item
     * @private
     */
    _makeWorkflowItem: function(type, item) {
        this._internalId++;
        return {"id":"workflowItem" + this._internalId, "type":type, "selected":0, "item":item, "result":""};
    },
    
    /**
     * Execute the passed step of the desired workflow
     * We will store the results as JSON in 'result'
     * @param e
     * @private
     */
    _executeWorkflow: function(e) {
        e.stopPropagation(); // Prevent double submit if icon is clicked instead of button
        console.log("Exec: " + this._workflow._id);
        
        // TODO Eventually we need to still be able to execute a single, non-chain query/transformer. This would change the UI a bit, and also use a different execution approach
        // TODO Eventually we need to pass a "stopHere" with the selected workflow item, to ensure chain execution halts at a certain query/transformer
        
        // TODO Need to figure out if we POST/PUT all queries/transformers/chain data first, since we use the saved ID only
        
        var _this = this;
        // TODO MANUAL We should have a way to execute a query from our client library
        // TODO Also pass along workflow request parameters (as URL & params), such as status=active, see this._workflow.properties.testData (may not exist)
        bridgeit.$.getJSON(this.buildUrl(this.tempQueryService, this.tempQueryResource, this._workflow._id) + "&exec=true&op=execute&mode=debug")
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
        }).catch(function(error){
            console.error("Error when trying to execute query: " + error.toSource());
        });
    },
    
    /**
     * Save the current workflow
     * This will give a default workflow name if there isn't one
     * We'll similarly generate a unique ID as needed
     * The content will be saved (either new or updated)
     * @param e
     * @private
     */
    _saveWorkflow: function(e) {
        // TODO Need to convert our workflow to the proper chain JSON, then POST/PUT to the query service
        
        // Check for an existing saved workflow with the same ID
        // If we find it override it, otherwise save the workflow as new
        var alreadyAdded = false;
        for (var i = 0; i < this._savedWorkflows.length; i++) {
            if (this._workflow._id === this._savedWorkflows[i]._id) {
                alreadyAdded = true;
                
                this.set('_savedWorkflows.' + i, this._workflow);
                
                break;
            }
        }
        
        if (!alreadyAdded) {
            this.push('_savedWorkflows', this._workflow);
        }
    },
    
    /**
     * Load a saved workflow, including id, name, and content
     * @param e
     * @private
     */
    _loadWorkflow: function(e) {
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
     * @private
     */
    _removeWorkflow: function(e) {
        var removeId = e.target.getAttribute('data-workflow-item');
        
        for (var i = 0; i < this._savedWorkflows.length; i++) {
            if (removeId === this._savedWorkflows[i]._id) {
                this.splice('_savedWorkflows', i, 1);
                
                break;
            }
        }
    },
    
    /**
     * Clear the workflow state, including id, name, and content
     * @param e
     * @private
     */
    _resetWorkflow: function(e) {
        this._workflow = { "_id":"newWorkflow", "selected": 0, "properties": { "title":"New Workflow", "parameters":[] }, "query":[] }
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