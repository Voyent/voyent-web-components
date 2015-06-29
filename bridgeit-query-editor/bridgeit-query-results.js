var _qResults;

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

    created: function() {
        _qResults = this;
    },

    ready: function() {
        _qResults._tableHeaders = [];
        _qResults._tableRows = [];
        _qResults.setupListener();
    },

    /**
     * Adds an event listener for the `queryExecuted` event. Triggered on initialization if there is a valid `for` attribute.
     */
    setupListener: function() {
        if (!_qResults._validateFor()) { return; }

        document.getElementById(_qResults.for).addEventListener('queryExecuted', function(e) {
            var res = e.detail.results;
            if (Object.keys(res).length === 0) {
                _qResults._tableHeaders = [];
                _qResults._tableRows = [];
                _qResults.fire('queryMsgUpdated',{id:_qResults.id ? _qResults.id : null, message: 'Query results empty.','type':'error'});
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
            _qResults._tableHeaders = tableHeaders;
            _qResults._tableRows = tableRows;
        });
    },


    //******************PRIVATE API******************

    /**
     * Checks that the `for` attribute is pointing to a valid element.
     * @return {boolean} Boolean indicating if the for attribute is pointing to a valid `bridgeit-query-editor`.
     * @private
     */
    _validateFor: function() {
        if (!_qResults.for) {
            _qResults.fire('queryMsgUpdated',{id:_qResults.id ? _qResults.id : null, message: 'for attribute is required','type':'error'});
            return false;
        }
        if (!document.getElementById(_qResults.for) || document.getElementById(_qResults.for).tagName !== 'BRIDGEIT-QUERY-EDITOR') {
            _qResults.fire('queryMsgUpdated',{id:_qResults.id ? _qResults.id : null, message: 'element cannot be found or is not a bridgeit-query-editor','type':'error'});
            return false;
        }
        return true;
    },
});