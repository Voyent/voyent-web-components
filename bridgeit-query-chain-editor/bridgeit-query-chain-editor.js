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
         * Defines the currently selected query category, including the observer that will fire the changed function
         */
        selectedQuery: { type: Number, notify: true, observer: '_selectedQueryChanged' },
        /**
         * Defines the currently selected transformer category, including the observer that will fire the changed function
         */
        selectedTransformer: { type: Number, notify: true, observer: '_selectedTransformerChanged' }
    },
    
    /**
     * Usual ready function
     * This will initialize the palette, workflow, and saved workflows
     */
    ready: function() {
        // Initialize the palette
        this.getQueryCategories();
        this.getTransformerCategories();
        this.selectedQuery = 0;
        this.selectedTransformer = 0;
        
        // Set our variables
        this._workflow=[];
        //this._savedWorkflows = [{"id": 0, "name": "findUsersWithStatus", "content": []}];
        this._savedWorkflows = [];
    },
    
    /**
     * Function to initialize the palette, specifically the query categories
     */
    getQueryCategories: function() {
        this._queryCategories = [ {"name": "Common", "queries": [{"_id": "Custom"}, {"_id": "Property Mapper"}]},
                                  {"name": "Location", "queries": [{"_id": "Last User Location"}, {"_id": "User in Regions"}, {"_id": "User Near POI"}]},
                                  {"name": "Docs", "queries": [{"_id": "Recent File"}, {"_id": "Biggest Data"}]},
                                  {"name": "Storage", "queries": [{"_id": "All Data"}, {"_id": "Top 100 Chunks"}, {"_id": "Data by User"}]} ];
    },
    
    /**
     * Function to initialize the palette, specifically the transformer categories
     */
    getTransformerCategories: function() {
        this._transformerCategories = [ {"name": "Common", "transformers": [{"_id": "Custom"}, {"_id": "Property Mapper"}, {"_id": "Variable Converter"}]},
                                        {"name": "Location", "transformers": [{"_id": "Coords to Index"}, {"_id": "Lat/Long Convert"}, {"_id": "POI Measurements"}]},
                                        {"name": "Docs", "transformers": [{"_id": "File Type Transform"}, {"_id": "Size Checker"}]},
                                        {"name": "Storage", "transformers": [{"_id": "Data to Data Mapper"}, {"_id": "Timestamp Changer"}, {"_id": "Username Lookup"}]},
                                        {"name": "Metrics", "transformers": [{"_id": "Total Transform"}, {"_id": "Logger Customizer"}]} ];
    },
    
    //******************PRIVATE API******************
    /**
     * Function called when the query category is changed
     * @private
     */
    _selectedQueryChanged: function() {
        this._queries = this._queryCategories[this.selectedQuery].queries;
    },
    
    /**
     * Function called when the transformer category is changed
     * @private
     */
    _selectedTransformerChanged: function() {
        this._transformers = this._transformerCategories[this.selectedTransformer].transformers;
    },
    
    /**
     * Adds parameters to query dialogs.
     * @param e
     * @private
     */
    _addParam: function(e) {
        var item = this._getWorkflowItemById(e.target.getAttribute('data-workflow-item'));
        if (item) {
            this.push('_workflow.'+ this._workflow.indexOf(item) +'.bindings.params',{"name":"","type":"","description":"","default":""});
        }
    },
    
    /**
     * Adds parameters to query dialogs.
     * @param e
     * @private
     */
    _removeParam: function(e) {
        var item = this._getWorkflowItemById(e.target.getAttribute('data-workflow-item'));
        if (item) {
            var index = this._workflow.indexOf(item);
            if (this._workflow[index].bindings.params.length > 0) {
                this.pop('_workflow.'+index+'.bindings.params');
            }
            
            // If we just removed our last item we'll add a fresh one to keep the list populated
            if (this._workflow[index].bindings.params.length === 0) {
                this._addParam(e);
            }
        }
    },
    
    /**
     * Remove the current workflow item, such as a query or transformer
     * @param e
     * @private
     */
    _removeWorkflowItem: function(e) {
        var item = this._getWorkflowItemById(e.target.getAttribute('data-workflow-item'));
        if (item) {
            this.splice('_workflow', this._workflow.indexOf(item), 1);
        }
    },

    /**
     * Query ondragstart event handler.
     * @param e
     * @private
     */
    _startDragQuery: function(e) {
        this._startDragCommon(e);
        e.dataTransfer.setData('chain/query', e.model.query); //indicate that this item is a query
        this._lastDragged = e.model.query; //reference query so we can populate the UI on drop
    },

    /**
     * Transformer ondragstart event handler.
     * @param e
     * @private
     */
    _startDragTransformer: function(e) {
        this._startDragCommon(e);
        e.dataTransfer.setData('chain/transformer', e.model.transformer); //indicate that this item is a transformer
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
        //add new item to chain
        var item = JSON.parse(JSON.stringify(this._lastDragged));
        var type = e.dataTransfer.getData('chain/query') ? 'query' : 'transformer'; //determine the dropped item type
        var workflowItem = {"id":"workflowItem"+this._workflow.length,"type":type,"selected":0,"item":item,"result":""};
        
        var defaultId = "new" + this._workflow.length;
        if (item && item._id) {
            defaultId = "new" + item._id.toLowerCase().replace(/\s+/g, '') + this._workflow.length;
        }
        
        if (type === 'query') {
            workflowItem.bindings = {"properties":{"id":defaultId,"service":"","collection":"","type":"find"},
                                     "params":[{"name":"username","type":"String","description":"Name of the user","default":"\"\""},
                                               {"name":"id","type":"Number","description":"Core ID","default":"0"}]};
        }
        else if (type === 'transformer') {
            workflowItem.bindings = {"properties":{"id":defaultId},"transformer":{"from":["location","username"], "to":["regions"]}};
        }
        this.push('_workflow',workflowItem);
    },
    
    /**
     * Execute the passed step of the desired workflow
     * We will store the results as JSON in 'result'
     * @param e
     * @private
     */
    _executeWorkflow: function(e) {
        var item = this._getWorkflowItemById(e.target.getAttribute('data-workflow-item'));
        if (item) {
            item.result = "[\n  {\n";
            item.result += "    {\"type\": \"" + item.type + "\",\n    \"id\": \"" + item.bindings.properties.id + "\"}";
            item.result += "\n  }\n]";
            
            this.notifyPath('_workflow.' + this._workflow.indexOf(item) + '.result', item.result);
        }
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
        // Check if we have a name specified, otherwise default
        if (!this._workflowName || this._workflowName.length === 0) {
            this._workflowName = "New Workflow";
        }
        
        // Generate a unique ID for this workflow
        if (!this._workflowId) {
            this._workflowId = this._savedWorkflows.length + "-" + new Date().getMilliseconds();
        }
        
        // Check for an existing saved workflow with the same ID
        // If we find it override it, otherwise save the workflow as new
        var alreadyAdded = false;
        for (var i = 0; i < this._savedWorkflows.length; i++) {
            if (this._workflowId === this._savedWorkflows[i].id) {
                alreadyAdded = true;
                
                this.notifyPath('_savedWorkflows.' + i + '.name', this._workflowName);
                this.notifyPath('_savedWorkflows.' + i + '.content', this._workflow);
                
                break;
            }
        }
        
        if (!alreadyAdded) {
            this.push('_savedWorkflows', {"id": this._workflowId,
                                          "name": this._workflowName,
                                          "content": this._workflow});
        }
    },
    
    /**
     * Load a saved workflow, including id, name, and content
     * @param e
     * @private
     */
    _loadWorkflow: function(e) {
        var loadId = e.target.getAttribute('data-workflow-item');
        
        for (var i = 0; i < this._savedWorkflows.length; i++) {
            if (loadId === this._savedWorkflows[i].id) {
                this._workflowId = this._savedWorkflows[i].id;
                this._workflowName = this._savedWorkflows[i].name;
                this._workflow = this._savedWorkflows[i].content;
                
                break;
            }
        }
    },
    
    /**
     * Delete a saved workflow from our list
     * @param e
     * @private
     */
    _removeWorkflow: function(e) {
        var loadId = e.target.getAttribute('data-workflow-item');
        
        for (var i = 0; i < this._savedWorkflows.length; i++) {
            if (loadId === this._savedWorkflows[i].id) {
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
        this._workflowName = null;
        this._workflowId = null;
        this._workflow = [];
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
        return type === 'transformer';
    },
    
    /**
     * Helper function to get an actual workflow item via an ID
     * @param id
     * @returns {Object}
     * @private
     */
    _getWorkflowItemById: function(id) {
        if (id) {
            for (var i = 0; i < this._workflow.length; i++) {
                if (this._workflow[i] && this._workflow[i].id == id) {
                    return this._workflow[i];
                }
            }
        }
    }
});