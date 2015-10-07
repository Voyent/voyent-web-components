Polymer({
    is: "bridgeit-query-results",
    
    properties: {
        /**
         * The id of the `bridgeit-query-editor` component.
         */
        for: { type: String }
    },
    
    /**
     * Fired whenever there is a message for an action that was triggered. Contains the message and the message type (info, error).
     * @event queryMsgUpdated
     */

    ready: function() {
        this._tableHeaders = [];
        this._tableRows = [];
        this.setupListener();
    },

    /**
     * Adds an event listener for the `queryExecuted` event. Triggered on initialization if there is a valid `for` attribute.
     */
    setupListener: function() {
        var _this = this;
        if (!this._validateFor()) { return; }
        document.getElementById(this.for).addEventListener('queryExecuted', function(e) {
            var res = e.detail.results;
            if (Object.keys(res).length === 0) {
                _this._tableHeaders = [];
                _this._tableRows = [];
                _this.fire('queryMsgUpdated',{id:_this.id ? _this.id : null, message: 'Query results empty.','type':'error'});
                return;
            }
            var tableHeaders = e.detail.uniqueFields;
            var tableRows=[];
            for (var i=0; i<res.length; i++) {
                var document = res[i];
                var row=[];
                for (var j=0; j<tableHeaders.length; j++) {
                    var key = tableHeaders[j];
                    if (typeof document[key] !== 'undefined') {
                        row.push(document[key]);
                    }
                    else {
                        row.push(null);
                    }
                }
                tableRows.push(row);
            }
            _this._tableHeaders = tableHeaders;
            _this._tableRows = tableRows;
        });
    },


    //******************PRIVATE API******************

    /**
     * Checks that the `for` attribute is pointing to a valid element.
     * @return {boolean} Indicates if the for attribute is pointing to a valid `bridgeit-query-editor`.
     * @private
     */
    _validateFor: function() {
        if (!this.for) {
            this.fire('queryMsgUpdated',{id:this.id ? this.id : null, message: 'for attribute is required','type':'error'});
            return false;
        }
        if (!document.getElementById(this.for) || document.getElementById(this.for).tagName !== 'BRIDGEIT-QUERY-EDITOR') {
            this.fire('queryMsgUpdated',{id:this.id ? this.id : null, message: 'element cannot be found or is not a bridgeit-query-editor','type':'error'});
            return false;
        }
        return true;
    },
});