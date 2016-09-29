Polymer({
    is: "voyent-query-list",

    properties: {
        /**
         * The id of the `voyent-query-editor` component.
         */
        for: { type: String },
        /**
         * Selected index of the saved queries dropdown
         */
        selectedIndex: { type: Number, notify: true, observer: '_selectedIndexChanged' },
    },

    /**
     * Fired whenever there is a message for an action that was triggered. Contains the message and the message type (info, error).
     * @event queryMsgUpdated
     */
    ready: function() {
        this._hasQueries = false;
        this._allQueries = [];
        this.setupListener();
    },

    /**
     * Adds an event listener for the `queriesRetrieved` event. Triggered on initialization if there is a valid `for` attribute.
     */
    setupListener: function() {
        var _this = this;
        if (!this._validateFor()) { return; }
        _this._queryEditor.fetchQueryList();
        _this._queryEditor.addEventListener('queriesRetrieved', function(e) {
            _this._allQueries = e.detail.results;
            _this._hasQueries = _this._allQueries && _this._allQueries.length > 0;
            if (Object.keys(_this._allQueries).length === 0) {
                _this.fire('queryMsgUpdated',{id:_this.id ? _this.id : null, message: 'Query list is empty.','type':'error'});
            }
        });
    },


    //******************PRIVATE API******************

    /**
     * Checks that the `for` attribute is pointing to a valid element.
     * @return {boolean} Indicates if the for attribute is pointing to a valid `voyent-query-editor`.
     * @private
     */
    _validateFor: function() {
        if (!this.for) {
            this.fire('queryMsgUpdated',{id:this.id ? this.id : null, message: 'for attribute is required','type':'error'});
            return false;
        }
        if (!document.getElementById(this.for)) {
            //traverse through the dom tree to look for the component
            var parent = Polymer.dom(this).parentNode;
            var node;
            while (parent) {
                node = Polymer.dom(parent).querySelector('#'+this.for);
                if (node) {
                    break;
                }
                parent = Polymer.dom(parent).parentNode;
            }
            if (node && node.tagName === 'VOYENT-QUERY-EDITOR') {
                this._queryEditor = node;
                return true;
            }
        }
        else if (document.getElementById(this.for).tagName === 'VOYENT-QUERY-EDITOR') {
            this._queryEditor = document.getElementById(this.for);
            return true;
        }
        this.fire('queryMsgUpdated',{id:this.id ? this.id : null, message: 'element cannot be found or is not a voyent-query-editor','type':'error'});
        return false;
    },

    /**
     * Loads the selected query into the query editor.
     * @param e
     * @private
     */
    _viewQuery: function() {
        if (typeof this.selectedIndex !== 'undefined' && this.selectedIndex >= 0 && this.selectedIndex <= (this._allQueries.length-1)) {
            var queryEditor = document.getElementById(this.for);
            queryEditor.setEditorFromMongo(this._allQueries[this.selectedIndex]);
            queryEditor.runQuery();
            
            var _this = this;
            setTimeout(function() {
                _this.set('selectedIndex', null);
            },2000);
        }
        else {
            this.fire('message-error', 'Select a query to view');
            console.error('Select a query to view');
        }
    },
    
    /**
     * Fired when the selectedIndex changes
     * If we have a valid new index we try to load it
     */
    _selectedIndexChanged: function() {
        if (typeof this.selectedIndex !== 'undefined' && this.selectedIndex !== null) {
            this._viewQuery();
        }
    },
});