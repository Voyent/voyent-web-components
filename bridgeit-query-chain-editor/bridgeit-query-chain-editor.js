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
        account: { type: String }
    },

    ready: function() {
        //populate the palette
        this.getQueries();
        this.getTransformers();
        //initialization
        this._workflow=[];
    },

    /**
     * Get the available queries for the realm.
     */
    getQueries: function() {
        var _this = this;
        bridgeit.io.query.findQueries({"account":this.account,"realm":this.realm}).then(function(queries) {
            _this._queries = queries;
            //TODO - Remove this once getTransformers is completed.
            _this._transformers = queries; //Populate the transformer palette with queries as placeholders for now
        }).catch(function(error) {
            console.log('Error in getQueries:',error);
            _this.fire('bridgeit-error', {error: error});
        });
    },

    /**
     * Gets the available transformers for the realm.
     */
    getTransformers: function() { //TODO - API for this doesn't exist yet
        /*var _this = this;
        bridgeit.io.query.findTransfomers({"account":this.account,"realm":this.realm}).then(function(transformers) {
            _this._transformers = transformers;
        }).catch(function(error) {
            console.log('Error in getTransformers:',error);
            _this.fire('bridgeit-error', {error: error});
        });*/
    },


    //******************PRIVATE API******************

    /**
     * Adds parameters to query dialogs.
     * @param e
     * @private
     */
    _addParam: function(e) {
        var index = e.target.getAttribute('data-workflow-item').slice(-1);
        this.push('_workflow.'+index+'.bindings.params',{"name":"","type":"","description":"","default":""});
    },

    /**
     * Query ondragstart event handler.
     * @param e
     * @private
     */
    _startDragQuery: function(e) {
        e.dataTransfer.setData('chain/query', e.model.query); //indicate that this item is a query
        this._lastDragged = e.model.query; //reference query so we can populate the UI on drop
    },

    /**
     * Transformer ondragstart event handler.
     * @param e
     * @private
     */
    _startDragTransformer: function(e) {
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
     * Workflow ondrop event handler.
     * @param e
     * @private
     */
    _dropInWorkflow: function(e) {
        e.preventDefault();
        //add new item to chain
        var item = JSON.parse(JSON.stringify(this._lastDragged));
        var type = e.dataTransfer.getData('chain/query') ? 'query' : 'transformer'; //determine the dropped item type
        var workflowItem = {"id":"workflowItem"+this._workflow.length,"type":type,"selected":0,"item":item};
        if (type === 'query') {
            workflowItem.bindings = {"properties":{"id":"","service":"","collection":"","type":"find"},"params":[{"name":"","type":"","description":"","default":""}]};
        }
        else {
            workflowItem.bindings = {"properties":{"id":""}};
        }
        this.push('_workflow',workflowItem);
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
    }
});