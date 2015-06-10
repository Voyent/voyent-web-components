var _qResults;

Polymer({

    is: "bridgeit-query-results",

    /**
     * Fired whenever there is a message for an action that was triggered. Contains the message and the message type (info, error).
     * @event queryMsgUpdated
     */
    properties: {
        /**
         * The id of the bridgeit-query-editor component.
         */
        for: { type: String },
        /**
         * Styling to be set directly on the query results table.
         */
        tblstyle: { type: String }
    },

    _tableHeaders:[],
    _tableRows:[],

    ready: function() {
        _qResults = this;
        if (!_qResults.for) {
            _qResults.fire('queryMsgUpdated',{id:_qResults.id ? _qResults.id : null, message: 'for attribute is required','type':'error'});
            return;
        }
        var editor = document.getElementById(_qResults.for);
        if (editor) {
            if (editor.tagName === 'BRIDGEIT-QUERY-EDITOR') {
                editor.addEventListener('queryExecuted', function(e) {
                    var res = e.detail.results;
                    if (Object.keys(res).length === 0) {
                        _qResults.fire('queryMsgUpdated',{id:_qResults.id ? _qResults.id : null, message: 'Query results empty.','type':'error'});
                        _qResults._tableHeaders = [];
                        _qResults._tableRows = [];
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
            }
            else {
                _qResults.fire('queryMsgUpdated',{id:_qList.id ? _qList.id : null, message: 'element is not bridgeit-query-editor','type':'error'});
            }
        }
        else {
            _qResults.fire('queryMsgUpdated',{id:_qResults.id ? _qResults.id : null, message: 'query-editor component not found','type':'error'});
        }
    }
});