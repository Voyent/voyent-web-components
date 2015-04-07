var _qResults;

Polymer({

    /**
     * Fired whenever there is a message for an action that was triggered. Contains the message and the message type (info, error).
     *
     * @event queryMsgUpdated
     */

    /**
     * The id of the bridgeit-query-editor component.
     *
     * @attribute for
     * @type string
     * @default null
     */
    for: null,

    /**
     * A set of styles as name:value pairs, set directly on the query results table.
     *
     * @attribute tblstyle
     * @type object
     * @default {}
     */
    tblstyle: {},

    tableHeaders:[],
    tableRows:[],

    domReady: function() {
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
                        _qResults.tableHeaders = [];
                        _qResults.tableRows = [];
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
                    _qResults.tableHeaders = tableHeaders;
                    _qResults.tableRows = tableRows;
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